import ctypes
import json
import os
import tempfile
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from agent import child_environment, codex_startup_environment, windows_system_drive, TaskError
from codex_executor import CodexRunner, settings
from codex_executor import capture
from windows_process import JobProcess


@unittest.skipUnless(os.name == 'nt', 'Windows native environment and MXC')
class WindowsEnvironmentTest(unittest.TestCase):
    def test_validated_system_drive_and_only_required_startup_paths(self):
        self.assertRegex(windows_system_drive(),r'^[A-Za-z]:$')
        required=codex_startup_environment()
        self.assertEqual({'SYSTEMDRIVE','LOCALAPPDATA'},set(required))
        with patch.dict(os.environ,{'CREATORFLOW_API_TOKEN':'private-operator-value','CREATORFLOW_AGENT_ENROLLMENT_TOKEN':'private-enrollment-value','DB_PASSWORD':'private-db-value','OPENAI_API_KEY':'private-provider-value'}):
            child=child_environment()
            self.assertEqual(required['SYSTEMDRIVE'],child['SYSTEMDRIVE'])
            self.assertFalse(any(k in child for k in ('CREATORFLOW_API_TOKEN','CREATORFLOW_AGENT_ENROLLMENT_TOKEN','DB_PASSWORD','OPENAI_API_KEY','LOCALAPPDATA')))
            arguments=settings([Path(tempfile.gettempdir())/'allowed.txt'])
            self.assertIn('shell_environment_policy.inherit="none"',arguments)
            self.assertFalse(any('private-' in value for value in arguments))
            forward=next(value for value in arguments if value.startswith('shell_environment_policy.set='))
            self.assertIn('SYSTEMDRIVE',forward);self.assertIn('LOCALAPPDATA',forward)
    def test_invalid_or_missing_host_values_fail_closed(self):
        for invalid in ('','Z:/escape','C:\\arbitrary','\\\\server\\share'):
            with patch.dict(os.environ,{'SYSTEMDRIVE':invalid}):
                self.assertNotIn('SYSTEMDRIVE',child_environment())
                with self.assertRaisesRegex(TaskError,'WINDOWS_STARTUP_ENV_INVALID'):codex_startup_environment()
        with patch.dict(os.environ,{'LOCALAPPDATA':'C:/not-the-host-known-folder'}):
            with self.assertRaisesRegex(TaskError,'WINDOWS_STARTUP_ENV_INVALID'):codex_startup_environment()
    def test_real_mxc_exact_file_network_canary_after_process_restart(self):
        # No inference: each probe launches a fresh native Codex/MXC process tree.
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for _ in range(2):
                runner=CodexRunner(root)
                self.assertTrue(runner.executable,'Installed native Codex is required for this Windows acceptance')
                self.assertTrue(runner.probe(),'Strict native MXC canary failed; do not enable execution')
            reports=list((root/'execution-evidence').glob('probe-*/result.json'))
            self.assertEqual(2,len(reports))
            for report in reports:
                result=json.loads(report.read_text());self.assertTrue(result['passed']);self.assertEqual(0,result['exitCode'])
                self.assertEqual({'allowed':True,'blocked':False,'outsideRead':False,'outsideWrite':False,'network':False},result['checks'])
    def test_real_mxc_job_cancel_and_timeout_kill_descendants(self):
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong];kernel.OpenProcess.restype=ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong];kernel.CloseHandle.argtypes=[ctypes.c_void_p]
        def alive(pid):
            handle=kernel.OpenProcess(0x100000,False,pid)
            if not handle:return False
            try:return kernel.WaitForSingleObject(handle,0)==258
            finally:kernel.CloseHandle(handle)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);runner=CodexRunner(root)
            for timeout in (False,True):
                marker=root/('timeout.txt' if timeout else 'cancel.txt');marker.write_text('')
                script="import os,sys,subprocess,json,time;from pathlib import Path;p=subprocess.Popen([sys.executable,'-I','-c','import time;time.sleep(90)']);Path(sys.argv[1]).write_text(json.dumps([os.getpid(),p.pid]));time.sleep(90)"
                argv=[runner.executable,*settings([marker],[Path(sys.base_prefix)]),'sandbox','--permission-profile','creatorflow_execution','-C',str(root),'--',sys.executable,'-I','-c',script,str(marker)]
                if timeout:
                    with self.assertRaisesRegex(TaskError,'TIMEOUT'):capture(argv,root,time.monotonic()+3)
                else:
                    process=JobProcess(argv,root,child_environment(),piped=True)
                    try:
                        until=time.monotonic()+10
                        while not marker.read_text() and time.monotonic()<until:time.sleep(.05)
                        self.assertTrue(marker.read_text(),'MXC descendant marker missing')
                        self.assertTrue(all(alive(pid) for pid in json.loads(marker.read_text())))
                    finally:process.close()
                self.assertTrue(marker.read_text(),'MXC process did not start before timeout')
                until=time.monotonic()+5
                while any(alive(pid) for pid in json.loads(marker.read_text())) and time.monotonic()<until:time.sleep(.05)
                self.assertFalse(any(alive(pid) for pid in json.loads(marker.read_text())),'MXC descendants outlived owned Job')


if __name__=='__main__':unittest.main()
