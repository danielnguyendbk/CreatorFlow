import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch
from agent import TaskError, child_environment, exclusive_lock
from worktrees import WorktreeManager


class WorktreeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.repos = self.directory / 'repos';self.repos.mkdir()
        self.repo = self.repos / 'fixture';self.repo.mkdir()
        self.root = self.directory / 'agent';self.root.mkdir()
        self.git = shutil.which('git.exe')
        self.command('init', '--initial-branch=main')
        self.command('remote', 'add', 'origin', 'https://example.invalid/fixture.git')
        (self.repo / 'README.md').write_text('fixture unchanged\n', encoding='utf-8')
        self.command('add', 'README.md')
        self.command('-c', 'user.name=CreatorFlow Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
        self.commit = self.command('rev-parse', 'HEAD')
        self.agent = str(uuid.uuid4());self.repo_id = str(uuid.uuid4());self.workspace_id = str(uuid.uuid4());self.task_id = str(uuid.uuid4())
        self.registration = dict(id=self.repo_id, agentId=self.agent, canonicalPath=str(self.repo), remoteUrl='https://example.invalid/fixture.git', allowedBases=['main'], protectedBranches=['main', 'develop'], enabled=True, configHash='a'*64)
        owner = self
        class Client:
            identity = {'id': owner.agent}
            def get(self, path):return [owner.registration]
            def post(self, path, body):return {}
        self.environment = patch.dict(os.environ, {'CREATORFLOW_REPOSITORY_ROOTS': str(self.repos)})
        self.environment.start()
        self.manager = WorktreeManager(self.root, Client(), str(uuid.uuid4()))
        self.workspace = dict(id=self.workspace_id, repositoryId=self.repo_id, agentId=self.agent, baseRef='main', baseCommit=self.commit,
            branch='creatorflow/'+self.workspace_id, relativePath='coding-worktrees/'+self.workspace_id, allocationTaskId=self.task_id, lastCheckpointId=None)
        self.task = dict(id=self.task_id,kind='WORKTREE_PREPARE',timeoutSec=20,attempt=1,workspace=self.workspace)

    def command(self, *args):
        result = subprocess.run([self.git, *args],cwd=self.repo,env=child_environment(),capture_output=True,text=True,timeout=10)
        self.assertEqual(0,result.returncode,'Fixture Git setup failed')
        return result.stdout.strip()

    def tearDown(self):
        # Test-only temp fixtures, not an allocator cleanup implementation.
        self.environment.stop()
        self.temp.cleanup()

    def test_exact_commit_main_unchanged_restart_inspect_and_controlled_cleanup(self):
        report = self.manager.execute(self.task)
        self.assertEqual('READY', report['state'])
        self.assertEqual(self.commit, report['headCommit'])
        self.assertEqual('', self.command('status','--porcelain'))
        self.assertEqual('main', self.command('branch','--show-current'))
        self.workspace['lastCheckpointId'] = report['checkpointId']
        restarted = WorktreeManager(self.root, self.manager.client, str(uuid.uuid4()))
        inspected = restarted.execute(dict(self.task,kind='WORKTREE_INSPECT'))
        self.assertEqual('READY',inspected['state'])
        self.workspace['lastCheckpointId'] = inspected['checkpointId']
        result = restarted.execute(dict(self.task,kind='WORKTREE_CLEANUP'))
        self.assertEqual('CLEANED',result['state'])
        self.assertFalse((self.root/self.workspace['relativePath']).exists())
        self.assertEqual(self.commit,self.command('rev-parse','HEAD'))

    def test_second_writer_dirty_workspace_and_missing_ownership_fail_closed(self):
        with exclusive_lock(self.root/'coding-locks'/(self.workspace_id+'.lock')):
            with self.assertRaisesRegex(TaskError,'WORKTREE_BUSY'):self.manager.execute(self.task)
        report=self.manager.execute(self.task);self.assertEqual('READY',report['state'])
        self.workspace['lastCheckpointId']=report['checkpointId']
        path=self.root/self.workspace['relativePath'];(path/'untracked.txt').write_text('retain this work',encoding='utf-8')
        self.assertEqual('NEEDS_RECONCILIATION',self.manager.execute(dict(self.task,kind='WORKTREE_CLEANUP'))['state'])
        self.assertTrue(path.exists())
        (self.root/'coding-journals'/(self.workspace_id+'.json')).unlink()
        self.assertEqual('NEEDS_RECONCILIATION',self.manager.execute(dict(self.task,kind='WORKTREE_INSPECT'))['state'])

    def test_junction_and_unapproved_root_or_remote_and_filters_rejected(self):
        junction=self.directory/'junction'
        import _winapi
        _winapi.CreateJunction(str(self.repo),str(junction))
        try:
            self.registration['canonicalPath']=str(junction)
            self.assertEqual('NEEDS_RECONCILIATION',self.manager.execute(self.task)['state'])
        finally:os.rmdir(junction)
        self.registration['canonicalPath']=str(self.repo)
        self.registration['remoteUrl']='https://example.invalid/other.git'
        self.assertEqual('NEEDS_RECONCILIATION',self.manager.execute(self.task)['state'])
        self.registration['remoteUrl']='https://example.invalid/fixture.git'
        self.command('config','filter.malicious.smudge','forbidden-executable')
        self.assertEqual('NEEDS_RECONCILIATION',self.manager.execute(self.task)['state'])
        self.assertFalse((self.root/self.workspace['relativePath']).exists())

    def test_hooks_are_disabled_and_timeout_cancellation_use_job_cleanup(self):
        sentinel=self.directory/'hook-ran'
        (self.repo/'.git/hooks/post-checkout').write_text('#!/bin/sh\ntouch "'+str(sentinel).replace('\\','/')+'"\n',encoding='utf-8')
        self.assertEqual('READY',self.manager.execute(self.task)['state'])
        self.assertFalse(sentinel.exists())
        with self.assertRaisesRegex(TaskError,'TIMEOUT'):self.manager.git(['version'],self.repo,time.monotonic()-1)
        self.manager.tick=lambda: (_ for _ in ()).throw(TaskError('CANCELLED'))
        with self.assertRaisesRegex(TaskError,'CANCELLED'):self.manager.git(['version'],self.repo,time.monotonic()+5)


if __name__=='__main__':unittest.main()
