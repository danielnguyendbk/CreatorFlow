"""Controlled P5 acceptance against a loopback backend and operator-created fixture only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from agent import Client, child_environment, protect
from credentials import replace_identity
from worktrees import plain_path


def wait(predicate, seconds=35):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        try:
            value=predicate()
            if value:return value
        except (OSError,ValueError):pass
        time.sleep(.2)
    raise RuntimeError('Acceptance condition timed out')


def main(args):
    fixture=json.loads(Path(args.fixture_evidence).read_text(encoding='utf-8'))
    root=plain_path(args.root).resolve();repo=plain_path(fixture['repositoryPath']).resolve()
    if not repo.is_relative_to(plain_path(fixture['approvedParent']).resolve()) or repo.name.startswith('CreatorFlow'):
        raise RuntimeError('Only the designated fixture repository is permitted')
    client=Client(args.backend)
    client.identity=json.loads(protect((root/'identity.dpapi').read_bytes(),True))
    agent_id=client.identity['id']
    if agent_id!=fixture['agentId']:raise RuntimeError('Fixture agent mismatch')
    browser=os.environ['CREATORFLOW_API_TOKEN']
    evidence=dict(agentId=agent_id,completed=[],aiExecutionEnabled=False)
    output=Path(args.evidence);output.parent.mkdir(parents=True,exist_ok=True)
    worker=None;backend=None
    logs=open(output.parent/'p5-process-recovery.log','ab')
    api_http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def api(path,body=None):
        request=urllib.request.Request(args.backend+'/api/v2/'+path,None if body is None else json.dumps(body).encode(),{'Authorization':'Bearer '+browser,'Content-Type':'application/json'})
        with api_http.open(request,timeout=4) as response:return json.load(response)
    def stage(name):
        evidence['completed'].append(name);output.write_text(json.dumps(evidence,indent=2),encoding='utf-8');print('PASS '+name,flush=True)
    def inventory():return api('coding')
    def workspace(id):return next(w for w in inventory()['workspaces'] if w['id']==id)
    def terminal(id,expected,seconds=35):return wait(lambda:(w if (w:=workspace(id))['state']==expected and not w['writer_locked'] else None),seconds)
    def operation(id,kind):
        result=api('coding/operations',dict(workspaceId=id,taskType=kind,idempotencyKey=str(uuid.uuid4())))
        wait(lambda:api('agent-tasks/'+result['current_task_id'])['state']=='SUCCEEDED')
        return workspace(id)
    def stop_worker():
        nonlocal worker
        if worker:
            if worker.poll() is None:worker.terminate();worker.wait(timeout=8)
        else:
            os.kill(args.worker_pid,15)
        time.sleep(.3)
    def start_worker():
        nonlocal worker
        env={k:v for k,v in os.environ.items() if k.upper()!='CREATORFLOW_API_TOKEN' and not k.upper().startswith('DB_')}
        env.update(CREATORFLOW_REPOSITORY_ROOTS=fixture['approvedParent'],CREATORFLOW_USAGE_ENABLED='false')
        worker=subprocess.Popen([sys.executable,str(Path(__file__).with_name('agent.py')),'--backend',args.backend,'--root',str(root),'--name','P5 Fixture Agent'],env=env,stdout=logs,stderr=logs,creationflags=subprocess.CREATE_NO_WINDOW)
        wait(lambda:next((a for a in api('agents') if a['id']==agent_id and a['status']=='ONLINE'),None))
        Path('storage/p5-worker.pid').write_text(str(worker.pid),encoding='utf-8')
    def restart_backend():
        nonlocal backend
        if backend:
            backend.terminate();backend.wait(timeout=10)
        else:os.kill(args.backend_pid,15)
        time.sleep(.5)
        java=Path(os.environ['JAVA_HOME'])/'bin/java.exe'
        backend=subprocess.Popen([str(java),'-jar',str(Path(args.backend_jar).resolve())],stdout=logs,stderr=logs,creationflags=subprocess.CREATE_NO_WINDOW)
        Path('storage/agent-backend.pid').write_text(str(backend.pid),encoding='utf-8')
        wait(lambda:bool(api('coding')),35)
    def unchanged():
        for arguments,expected in [(['rev-parse','HEAD'],fixture['baseCommit']),(['branch','--show-current'],'main'),(['status','--porcelain'],'')]:
            r=subprocess.run([shutil.which('git.exe'),*arguments],cwd=repo,env=child_environment(),capture_output=True,text=True,timeout=5)
            if r.returncode or r.stdout.strip()!=expected:raise RuntimeError('Fixture main changed')
    try:
        registered=next(r for r in inventory()['repositories'] if r['canonicalPath'].casefold()==str(repo).casefold() and r['agentId']==agent_id)
        original=next(w for w in inventory()['workspaces'] if w['repository_id']==registered['id'] and w['state']=='READY')
        original_id=original['id'];evidence.update(repositoryId=registered['id'],workspaceId=original_id,baseCommit=fixture['baseCommit'])
        unchanged();stage('Browser-created real workspace READY; fixture main unchanged')
        stop_worker();start_worker();inspected=operation(original_id,'WORKTREE_INSPECT')
        if inspected['owner_session']==original['owner_session']:raise RuntimeError('New agent session not recorded')
        stage('Agent restart preserved ownership; new fenced inspect checkpoint')
        before=inspected['last_checkpoint_id'];restart_backend()
        if workspace(original_id)['last_checkpoint_id']!=before:raise RuntimeError('Checkpoint lost on backend restart')
        operation(original_id,'CODING_PREFLIGHT');stage('Backend restart preserved checkpoint; preflight only completed without inference')
        # Interrupt a second allocation. Lease expiry must quarantine, not auto-adopt/delete it.
        orphan=api('coding/workspaces',dict(repositoryId=registered['id'],baseRef='main',baseCommit=fixture['baseCommit'],role='CODEX_EXECUTOR',allowedScope='WORKSPACE_ONLY',objective='Interrupted fixture allocation only',allowedFiles=['README.md'],prohibitedPaths=['private/**'],timeoutSec=30,maxAttempts=1,budgetPolicyId=None,provider='NONE',idempotencyKey=str(uuid.uuid4()),checkpointReferences=[],taskType='WORKTREE_PREPARE'))
        orphan_id=orphan['id'];task_id=orphan['current_task_id']
        running=wait(lambda:(t if (t:=api('agent-tasks/'+task_id))['state']=='RUNNING' else None))
        stale_session=running['sessionId'];stop_worker()
        terminal(orphan_id,'NEEDS_RECONCILIATION',25)
        try:api('coding/operations',dict(workspaceId=orphan_id,taskType='WORKTREE_CLEANUP',idempotencyKey=str(uuid.uuid4())))
        except urllib.error.HTTPError as error:
            if error.code!=409:raise
        else:raise RuntimeError('Orphan cleanup was not rejected')
        client.identity=json.loads(protect((root/'identity.dpapi').read_bytes(),True))
        try:client.post('coding/tasks/'+task_id+'/checkpoint',dict(sessionId=stale_session,attempt=running['attempt'],checkpointId=str(uuid.uuid4()),state='READY',headCommit=fixture['baseCommit'],dirty=False))
        except urllib.error.HTTPError as error:
            if error.code!=409:raise
        else:raise RuntimeError('Stale checkpoint accepted')
        evidence['orphanWorkspaceId']=orphan_id;stage('Interrupted allocation quarantined; cleanup and late checkpoint denied')
        start_worker();operation(original_id,'WORKTREE_INSPECT')
        stop_worker()
        # Persist candidate, commit server hash, lose local response, restart both components.
        old_identity=json.loads(protect((root/'identity.dpapi').read_bytes(),True));client.identity=old_identity
        intent=api('agent-credentials/'+agent_id+'/rotate',dict(confirmation='ROTATE'))
        candidate=dict(old_identity,credential=secrets.token_urlsafe(32),generation=intent['generation'],rotationId=intent['id'])
        replace_identity(root/'identity-next.dpapi',candidate,protect)
        client.post('credentials/commit',dict(rotationId=intent['id'],generation=intent['generation'],candidateHash=hashlib.sha256(candidate['credential'].encode()).hexdigest()))
        restart_backend();start_worker()
        wait(lambda:json.loads(protect((root/'identity.dpapi').read_bytes(),True)).get('generation')==candidate['generation'])
        try:client.post('heartbeat',dict(sessionId=stale_session))
        except urllib.error.HTTPError as error:
            if error.code!=401:raise
        else:raise RuntimeError('Old credential remained usable')
        evidence['recoveredCredentialGeneration']=candidate['generation'];stage('Lost rotation response plus backend/agent restart recovered DPAPI candidate; stale key denied')
        operation(original_id,'WORKTREE_INSPECT')
        ff=api('agent-tasks',dict(agentId=agent_id,kind='FFMPEG_FIXTURE',idempotencyKey=str(uuid.uuid4()),worktreeKey='p5-ffmpeg-regression',timeoutSec=20,durationSec=1))
        wait(lambda:api('agent-tasks/'+ff['id'])['state']=='SUCCEEDED');evidence['ffmpegTaskId']=ff['id'];stage('Existing real FFmpeg fixture remains functional')
        cleaned=operation(original_id,'WORKTREE_CLEANUP')
        if cleaned['state']!='CLEANED' or (root/cleaned['relative_path']).exists():raise RuntimeError('Controlled cleanup incomplete')
        unchanged();stage('Controlled clean worktree removal; main unchanged; evidence metadata retained')
        api('agent-credentials/'+agent_id+'/revoke',dict(confirmation='REVOKE'))
        current=Client(args.backend);current.identity=json.loads(protect((root/'identity.dpapi').read_bytes(),True))
        try:current.post('session',dict(capabilities=['CAPABILITY_PROBE']))
        except urllib.error.HTTPError as error:
            if error.code!=401:raise
        else:raise RuntimeError('Emergency-revoked identity accepted')
        stage('Emergency revoke denies runtime access; no auto enrollment')
        evidence['result']='PASS';output.write_text(json.dumps(evidence,indent=2),encoding='utf-8')
    finally:
        if worker and worker.poll() is None:worker.terminate();worker.wait(timeout=8)
        logs.close()
        # Keep the new loopback backend running for review; its PID is recorded, never guessed.


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--backend',default='http://127.0.0.1:8082');p.add_argument('--root',required=True);p.add_argument('--fixture-evidence',required=True);p.add_argument('--backend-pid',type=int,required=True);p.add_argument('--worker-pid',type=int,required=True);p.add_argument('--backend-jar',required=True);p.add_argument('--evidence',default='storage/p5-e2e-evidence.json')
    try:main(p.parse_args())
    except Exception as error:print('P5 process acceptance FAILED type='+type(error).__name__+'; inspect scoped state/evidence, no credentials logged');sys.exit(1)
