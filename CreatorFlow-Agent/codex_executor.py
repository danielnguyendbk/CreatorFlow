"""Fixed Codex exec adapter. No caller-supplied executable, shell, flags or MCP tools.

Only exact existing text files are editable. Native MXC must pass a real deny/allow
canary immediately before each invocation. Provider-owned login is never copied.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from agent import TaskError, child_environment, exclusive_lock
from codex_usage import resolve_codex
from worktrees import atomic_json, plain_path
from windows_process import JobProcess


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


@contextmanager
def lease_tick(manager,tick):
    previous=manager.tick;manager.tick=tick
    try:yield
    finally:manager.tick=previous


def profile(files, extra_reads=()):
    fs={':root':'deny',':minimal':'read',':tmpdir':'deny',':slash_tmp':'deny'}
    fs.update({str(plain_path(p)).replace('\\','/'):'read' for p in extra_reads})
    fs.update({str(plain_path(p)).replace('\\','/'):'write' for p in files})
    values=','.join(json.dumps(k)+'='+json.dumps(v) for k,v in fs.items())
    return '{filesystem={'+values+'},network={enabled=false}}'


def settings(files, extra_reads=()):
    # CLI 0.162.1 public help/features/schema and official named permission profiles.
    pairs=['windows.sandbox="mxc"','default_permissions="creatorflow_execution"',
           'permissions.creatorflow_execution='+profile(files,extra_reads),
           'approval_policy="never"','mcp_servers={}','plugins._default.enabled=false',
           'project_doc_max_bytes=0','web_search="disabled"',
           'shell_environment_policy.inherit="none"',
           'features.apps=false','features.plugins=false','features.hooks=false',
           'features.shell_tool=false','features.unified_exec=false','features.skill_search=false',
           'features.skip_host_skill_discovery=true','analytics.enabled=false']
    return [item for pair in pairs for item in ('-c',pair)]


def capture(argv,cwd,deadline,tick=lambda:None,input_text=None):
    process=JobProcess(argv,cwd,child_environment(),piped=True)
    output=[];too_large=[False]
    def read():
        count=0
        try:
            for chunk in iter(lambda:process.stdout.read(4096),''):
                count+=len(chunk)
                if count>1024*1024:too_large[0]=True;return
                output.append(chunk)
        except (OSError,ValueError):pass
    reader=threading.Thread(target=read,daemon=True);reader.start()
    try:
        if input_text is not None:process.stdin.write(input_text);process.stdin.flush()
        process.stdin.close()
        while process.poll() is None:
            tick()
            if time.monotonic()>deadline:raise TaskError('TIMEOUT')
            if too_large[0]:raise TaskError('OUTPUT_LIMIT')
            time.sleep(.05)
        code=process.poll();reader.join(timeout=2)
        if too_large[0] or reader.is_alive():raise TaskError('OUTPUT_LIMIT')
        return code,''.join(output)
    finally:process.close()


class CodexRunner:
    def __init__(self,root):
        self.root=plain_path(root);self.executable=resolve_codex()
        self.prepared=None
        (self.root/'execution-evidence').mkdir(exist_ok=True)

    def capability(self):
        version=None;error='CLI_NOT_FOUND';supported=False;verified=False
        try:
            if not self.executable:raise TaskError(error)
            code,out=capture([self.executable,'--version'],self.root,time.monotonic()+5)
            match=re.fullmatch(r'codex-cli (0\.162\.1)\s*',out)
            if code or not match:raise TaskError('PROTOCOL_UNSUPPORTED')
            version=match[1];supported=True
            verified=self.probe()
            error=None if verified else 'SANDBOX_NOT_VERIFIED'
        except Exception as ex:
            error=str(ex) if isinstance(ex,TaskError) else 'SANDBOX_NOT_VERIFIED'
        result=dict(cliVersion=version,protocolSupported=supported,sandboxVerified=verified,errorCode=error)
        result['evidenceHash']=digest(json.dumps(result,sort_keys=True))
        atomic_json(self.root/'execution-evidence'/'sandbox-capability.json',result)
        return result

    def probe(self,tick=lambda:None):
        # A startup-only MXC_OK is insufficient: prove exact-file writes, outside read/write
        # denial and loopback network denial with a listening test socket, without inference.
        probe=self.root/'execution-evidence'/('probe-'+str(uuid.uuid4()));probe.mkdir()
        work=probe/'work';work.mkdir();allowed=work/'allowed.txt';blocked=work/'blocked.txt';outside=probe/'outside.txt'
        allowed.write_text('before');blocked.write_text('blocked');outside.write_text('private-canary')
        server=socket.socket();server.bind(('127.0.0.1',0));server.listen(1);port=server.getsockname()[1]
        script=("from pathlib import Path;import socket,json\n"
                "result={}\n"
                "for name,path,mode in [('allowed',"+repr(str(allowed))+",'write'),('blocked',"+repr(str(blocked))+",'write'),('outsideRead',"+repr(str(outside))+",'read'),('outsideWrite',"+repr(str(outside))+",'write')]:\n"
                " try:\n  p=Path(path); p.write_text('changed') if mode=='write' else p.read_text();result[name]=True\n except OSError:result[name]=False\n"
                "try:\n s=socket.create_connection(('127.0.0.1',"+str(port)+"),timeout=1);s.close();result['network']=True\nexcept OSError:result['network']=False\n"
                "print(json.dumps(result))")
        try:
            argv=[self.executable,*settings([allowed],[Path(sys.base_prefix)]),'sandbox','--permission-profile','creatorflow_execution','-C',str(work),'--',sys.executable,'-I','-c',script]
            code,out=capture(argv,work,time.monotonic()+20,tick)
            try:result=json.loads(out.strip().splitlines()[-1])
            except (ValueError,IndexError):
                atomic_json(probe/'result.json',dict(passed=False,exitCode=code,errorCode='SANDBOX_PROBE_DID_NOT_COMPLETE'))
                return False
            passed=code==0 and result==dict(allowed=True,blocked=False,outsideRead=False,outsideWrite=False,network=False) and blocked.read_text()=='blocked' and outside.read_text()=='private-canary'
            atomic_json(probe/'result.json',dict(passed=passed,exitCode=code,checks=result))
            return passed
        finally:server.close()

    def prepare(self,path,files,tick):
        self.prepared=None
        code,out=capture([self.executable,'--version'],self.root,time.monotonic()+5,tick)
        if code or not re.fullmatch(r'codex-cli 0\.162\.1\s*',out):raise TaskError('PROTOCOL_UNSUPPORTED')
        if not self.probe(tick):raise TaskError('SANDBOX_NOT_VERIFIED')
        # No project/ancestor .codex layer is accepted. Normal provider-owned auth resolution
        # remains internal to Codex; user config/rules, hooks, apps and plugins are disabled.
        if any((p/'.codex/config.toml').exists() for p in [path,*path.parents]):raise TaskError('PROJECT_CONFIG_NOT_ALLOWED')
        if Path(os.environ.get('PROGRAMDATA','C:/ProgramData'),'codex/config.toml').exists():raise TaskError('MANAGED_INTEGRATION_NOT_VERIFIED')
        self.prepared=(str(path),tuple(files),time.monotonic()+15)

    def run(self,path,files,objective,timeout,tick,progress):
        proof=self.prepared;self.prepared=None
        if not proof or proof[:2]!=(str(path),tuple(files)) or proof[2]<time.monotonic():raise TaskError('SANDBOX_NOT_VERIFIED')
        argv=[self.executable,'exec','--ignore-user-config','--ignore-rules','--ephemeral','--strict-config','--json','--skip-git-repo-check','-C',str(path),*settings([path/f for f in files]),'-']
        prompt=('Edit only these existing exact files: '+json.dumps(files)+'. Do not use shell, MCP, network, Git, push, merge, deploy, credentials or account operations. Stop after edits. Objective: '+objective)
        progress('CODEX_STARTING')
        code,out=capture(argv,path,time.monotonic()+timeout,tick,prompt)
        completed=False
        for line in out.splitlines():
            try:event=json.loads(line)
            except ValueError:continue
            if event.get('type')=='turn.completed':completed=True
            # Never retain raw command output, model text, prompts or provider responses.
            item=event.get('item',{})
            if item.get('type') in ('mcp_tool_call','command_execution'):raise TaskError('UNEXPECTED_TOOL_USE')
        if code or not completed:raise TaskError('PROVIDER_FAILED')
        progress('CODEX_COMPLETED')


class ExecutionManager:
    def __init__(self,manager,client,session,runner=None):
        self.manager,self.client,self.session=manager,client,session
        self.root=manager.root;self.runner=runner or CodexRunner(self.root)
        (self.root/'execution-evidence').mkdir(exist_ok=True)

    def execute(self,execution,tick=lambda:None):
        id=str(uuid.UUID(execution['id']));contract=execution['contract'];task=contract['task'];workspace=str(uuid.UUID(task['workspaceId']))
        path=plain_path(self.root/'coding-worktrees'/workspace);journal=self.root/'execution-evidence'/(id+'.json')
        start=time.monotonic();deadline=start+task['timeoutSec'];attempt=dict(sessionId=self.session,attempt=1)
        result=dict(attempt,checkpointId=str(uuid.uuid4()),state='FAILED',diff='',changedFiles=[],diffSha256=digest(''),evidenceHash=digest(id),errorCode='AGENT_ERROR')
        def renew():
            tick()
            if time.monotonic()>deadline:raise TaskError('TIMEOUT')
            if time.monotonic()-renew.last>1:
                reply=self.client.post('coding/executions/'+id+'/renew',attempt)
                if reply['cancelRequested']:raise TaskError('CANCELLED')
                renew.last=time.monotonic()
        renew.last=0
        def evidence(phase):atomic_json(journal,dict(executionId=id,contractHash=execution['contract_hash'],sessionId=self.session,attempt=1,phase=phase))
        with lease_tick(self.manager,renew),exclusive_lock(self.root/'coding-locks'/(workspace+'.lock')):
            began=False
            try:
                if journal.exists():raise TaskError('RESTART_RECONCILIATION_REQUIRED')
                self.manager.sync();repository=self.manager.repositories[str(contract['repositoryId'])]
                repo,refs=self.manager.validate_repository(repository,deadline)
                if contract['repositoryConfigHash']!=repository['configHash'] or contract['baseCommit'] not in refs.values():raise TaskError('REPOSITORY_REJECTED')
                wjournal=json.loads((self.root/'coding-journals'/(workspace+'.json')).read_text())
                if wjournal.get('checkpointId')!=str(contract['checkpointId']) or wjournal.get('workspaceId')!=workspace or wjournal.get('agentId')!=self.client.identity['id'] or wjournal.get('baseCommit')!=contract['baseCommit']:raise TaskError('WORKSPACE_RECONCILIATION_REQUIRED')
                if Path(self.manager.required(['rev-parse','--git-common-dir'],path,deadline)).resolve()!=(repo/'.git').resolve():raise TaskError('WORKSPACE_RECONCILIATION_REQUIRED')
                if self.manager.required(['symbolic-ref','HEAD'],path,deadline)!='refs/heads/creatorflow/'+workspace or self.manager.required(['rev-parse','HEAD'],path,deadline)!=contract['baseCommit'] or self.manager.required(['status','--porcelain','--untracked-files=all','--ignored'],path,deadline):raise TaskError('WORKSPACE_RECONCILIATION_REQUIRED')
                files=task['allowedFiles'];before={}
                for f in files:
                    p=plain_path(path/f)
                    if not p.is_relative_to(path) or not p.is_file() or p.stat().st_nlink!=1 or p.stat().st_size>65536:raise TaskError('SCOPE_VIOLATION')
                    before[f]=digest(p.read_bytes());p.read_text(encoding='utf-8')
                evidence('START_INTENT')
                self.runner.prepare(path,files,renew)
                # Revalidate all backend gates after local inspection and immediately before inference.
                permit=self.client.post('coding/executions/'+id+'/begin',attempt)
                if not permit['permitted']:return
                began=True
                if permit['contractHash']!=execution['contract_hash']:raise TaskError('APPROVAL_FENCED')
                self.runner.run(path,files,task['objective'],max(1,deadline-time.monotonic()),renew,evidence)
                renew()
                changed=self.manager.required(['diff','--no-ext-diff','--name-only','--no-renames','HEAD','--'],path,deadline).splitlines()
                if not changed or not set(changed)<=set(files):raise TaskError('SCOPE_VIOLATION')
                status=self.manager.required(['status','--porcelain','--untracked-files=all','--ignored'],path,deadline)
                if any(line.startswith(('??','!!')) for line in status.splitlines()):raise TaskError('SCOPE_VIOLATION')
                for f in changed:
                    p=plain_path(path/f)
                    if not p.is_file() or p.stat().st_nlink!=1 or p.stat().st_size>65536:raise TaskError('SCOPE_VIOLATION')
                    p.read_text(encoding='utf-8')
                diff=self.manager.required(['diff','--no-ext-diff','--no-renames','--no-textconv','HEAD','--',*files],path,deadline)
                if len(diff.encode())>131072 or re.search(r'Bearer [A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY-----',diff):raise TaskError('SENSITIVE_EVIDENCE')
                values=[v for k,v in os.environ.items() if len(v)>16 and any(word in k.upper() for word in ('TOKEN','SECRET','PASSWORD','API_KEY'))]
                values.append(self.client.identity['credential'])
                if any(v in diff for v in values):raise TaskError('SENSITIVE_EVIDENCE')
                result.update(state='REVIEW_REQUIRED',diff=diff,changedFiles=changed,diffSha256=digest(diff),errorCode=None)
                result['evidenceHash']=digest(json.dumps(dict(before=before,after={f:digest((path/f).read_bytes()) for f in changed},contractHash=execution['contract_hash'],diffSha256=result['diffSha256']),sort_keys=True))
                evidence('REVIEW_REQUIRED')
            except Exception as error:
                code=str(error) if isinstance(error,TaskError) and re.fullmatch('[A-Z0-9_]{1,48}',str(error)) else 'AGENT_ERROR'
                result.update(state='CANCELLED' if code=='CANCELLED' else 'NEEDS_RECONCILIATION',errorCode=code)
                result['evidenceHash']=digest(json.dumps(dict(executionId=id,contractHash=execution['contract_hash'],sessionId=self.session,attempt=1,state=result['state'],errorCode=code),sort_keys=True))
                if journal.exists():evidence(result['state'])
            if began:self.client.post('coding/executions/'+id+'/result',result)
            # Before begin failures retain the claim for durable lease quarantine, never retry dirty work.
