import json
import sys
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
import test_worktrees
from agent import TaskError
from codex_executor import CodexRunner, ExecutionManager, capture, settings


class ExecutionTest(unittest.TestCase):
    def setUp(self):
        self.fixture=test_worktrees.WorktreeTest();self.fixture.setUp();f=self.fixture
        report=f.manager.execute(f.task);self.assertEqual('READY',report['state'])
        self.path=f.root/f.workspace['relativePath'];self.calls=[];owner=self
        class Client:
            identity={'id':f.agent,'credential':'test-only-private-credential'}
            def get(self,path):return [f.registration]
            def post(self,path,body):
                owner.calls.append((path,body))
                if path.endswith('/begin'):return dict(permitted=True,contractHash='c'*64)
                if path.endswith('/renew'):return dict(cancelRequested=False)
                return {}
        self.client=Client();f.manager.client=self.client
        self.execution=dict(id=str(uuid.uuid4()),contract_hash='c'*64,contract=dict(repositoryId=f.repo_id,repositoryConfigHash=f.registration['configHash'],baseCommit=f.commit,checkpointId=report['checkpointId'],task=dict(workspaceId=f.workspace_id,allowedFiles=['README.md'],objective='Fixture edit',timeoutSec=30)))
        self.count=0
        class MockAdapter:
            def prepare(self,path,files,tick):tick()
            def run(self,path,files,objective,timeout,tick,progress):
                owner.count+=1;tick();progress('MOCK_ONLY');(path/'README.md').write_text('fixture reviewed\n',encoding='utf-8')
        self.runner=MockAdapter();self.manager=ExecutionManager(f.manager,self.client,f.manager.session,self.runner)

    def tearDown(self):self.fixture.tearDown()
    def result(self):return next(body for path,body in self.calls if path.endswith('/result'))
    def test_mock_adapter_edits_isolated_file_and_records_review_diff_without_main_change(self):
        self.manager.execute(self.execution);result=self.result()
        self.assertEqual('REVIEW_REQUIRED',result['state']);self.assertEqual(['README.md'],result['changedFiles']);self.assertIn('+fixture reviewed',result['diff']);self.assertEqual(64,len(result['diffSha256']))
        self.assertEqual('',self.fixture.command('status','--porcelain'));self.assertEqual(self.fixture.commit,self.fixture.command('rev-parse','HEAD'))
    def test_scope_violation_retains_dirty_work_and_suppresses_diff(self):
        self.runner.run=lambda path,*_: (path/'outside.txt').write_text('unapproved fixture edit')
        self.manager.execute(self.execution);self.assertEqual('SCOPE_VIOLATION',self.result()['errorCode']);self.assertEqual('',self.result()['diff']);self.assertTrue((self.path/'outside.txt').exists())
    def test_dirty_restart_cannot_invoke_adapter_or_overwrite_files(self):
        def crash(path,*_):
            (path/'README.md').write_text('retained crash evidence');raise SystemExit('simulated owner crash')
        self.runner.run=crash
        with self.assertRaises(SystemExit):self.manager.execute(self.execution)
        self.assertTrue(any(path.endswith('/begin') for path,_ in self.calls));self.calls.clear()
        self.runner.run=lambda *_:self.fail('Restart must not invoke Codex')
        restarted=ExecutionManager(self.fixture.manager,self.client,self.fixture.manager.session,self.runner);restarted.execute(self.execution)
        self.assertFalse(any(path.endswith('/begin') for path,_ in self.calls));self.assertEqual('retained crash evidence',(self.path/'README.md').read_text())
    def test_cancel_timeout_and_secret_evidence_fail_closed(self):
        self.runner.run=lambda path,files,objective,timeout,tick,progress: (_ for _ in ()).throw(TaskError('CANCELLED'))
        self.manager.execute(self.execution);self.assertEqual('CANCELLED',self.result()['state'])
        self.execution['id']=str(uuid.uuid4());self.calls.clear()
        self.runner.run=lambda path,*_: (path/'README.md').write_text(self.client.identity['credential'])
        self.manager.execute(self.execution);self.assertEqual('SENSITIVE_EVIDENCE',self.result()['errorCode']);self.assertNotIn(self.client.identity['credential'],json.dumps(self.result()))
    def test_fixed_exec_arguments_have_no_shell_mcp_or_unscoped_roots(self):
        args=settings([self.path/'README.md']);self.assertIn('features.shell_tool=false',args);self.assertIn('features.hooks=false',args);self.assertIn('features.plugins=false',args);self.assertIn('mcp_servers={}',args)
        self.assertTrue(any('":root"="deny"' in arg for arg in args));self.assertFalse(any('danger-full-access' in arg for arg in args))
        with self.assertRaisesRegex(TaskError,'TIMEOUT'):capture([sys.executable,'-c','import time;time.sleep(30)'],self.fixture.root,time.monotonic()+.2)
    def test_sandbox_failure_never_starts_inference(self):
        runner=CodexRunner(self.fixture.root)
        with patch.object(runner,'probe',return_value=False),patch('codex_executor.capture') as process:
            with self.assertRaisesRegex(TaskError,'SANDBOX_NOT_VERIFIED'):runner.run(self.path,['README.md'],'fixture',5,lambda:None,lambda _:None)
            process.assert_not_called()
    def test_native_json_adapter_requires_completed_turn_and_rejects_unexpected_tools(self):
        runner=CodexRunner(self.fixture.root)
        def invoke(code,output):
            runner.prepared=(str(self.path),('README.md',),time.monotonic()+15)
            with patch('codex_executor.capture',return_value=(code,output)) as native:
                runner.run(self.path,['README.md'],'fixture-only objective',5,lambda:None,lambda _:None)
                argv=native.call_args.args[0]
                self.assertIn('--ignore-user-config',argv);self.assertNotIn('fixture-only objective',argv)
        invoke(0,json.dumps({'type':'turn.completed'})+'\n')
        with self.assertRaisesRegex(TaskError,'PROVIDER_FAILED'):invoke(0,json.dumps({'type':'turn.failed'})+'\n')
        with self.assertRaisesRegex(TaskError,'PROVIDER_FAILED'):invoke(1,json.dumps({'type':'turn.completed'})+'\n')
        events=json.dumps({'type':'item.completed','item':{'type':'mcp_tool_call'}})+'\n'+json.dumps({'type':'turn.completed'})+'\n'
        with self.assertRaisesRegex(TaskError,'UNEXPECTED_TOOL_USE'):invoke(0,events)


if __name__=='__main__':unittest.main()
