"""Windows child created suspended, assigned to a kill-on-close Job, then resumed.

No shell, no inherited handles. Closing the job also kills all descendants, including
when Windows terminates the owning agent abruptly.
"""
import ctypes
from ctypes import wintypes as w
import os
import subprocess

if os.name == "nt":
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    class Startup(ctypes.Structure):
        _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR), ("title", w.LPWSTR),
                    ("x", w.DWORD), ("y", w.DWORD), ("xs", w.DWORD), ("ys", w.DWORD),
                    ("xc", w.DWORD), ("yc", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                    ("show", w.WORD), ("reserved2size", w.WORD), ("reserved2", ctypes.c_void_p),
                    ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]
    class ProcessInfo(ctypes.Structure):
        _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE), ("pid", w.DWORD), ("tid", w.DWORD)]
    class Limits(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong), ("flags", w.DWORD),
                    ("min_ws", ctypes.c_size_t), ("max_ws", ctypes.c_size_t), ("active", w.DWORD),
                    ("affinity", ctypes.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]
    class IO(ctypes.Structure):
        _fields_ = [(x, ctypes.c_ulonglong) for x in ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]
    class Extended(ctypes.Structure):
        _fields_ = [("basic", Limits), ("io", IO), ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                    ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    kernel.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL,
                                     w.DWORD, ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(Startup), ctypes.POINTER(ProcessInfo)]
    kernel.ResumeThread.argtypes = [w.HANDLE]
    kernel.ResumeThread.restype = w.DWORD
    kernel.GetExitCodeProcess.argtypes = [w.HANDLE, ctypes.POINTER(w.DWORD)]
    kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
    kernel.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    kernel.CloseHandle.argtypes = [w.HANDLE]


class JobProcess:
    def __init__(self, argv, cwd, env):
        if os.name != "nt":
            raise RuntimeError("Windows agent requires Windows Job Objects")
        self.job = kernel.CreateJobObjectW(None, None)
        self.process = None
        info = ProcessInfo()
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            if not self.job or not kernel.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise ctypes.WinError(ctypes.get_last_error())
            startup = Startup()
            startup.cb = ctypes.sizeof(startup)
            environment = ctypes.create_unicode_buffer("\0".join(f"{k}={v}" for k, v in sorted(env.items())) + "\0\0")
            command = ctypes.create_unicode_buffer(subprocess.list2cmdline([str(a) for a in argv]))
            # CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT
            if not kernel.CreateProcessW(str(argv[0]), command, None, None, False, 0x08000404,
                                         environment, str(cwd), ctypes.byref(startup), ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            self.process, self.pid = info.process, info.pid
            if not kernel.AssignProcessToJobObject(self.job, self.process):
                kernel.TerminateProcess(self.process, 1)
                raise ctypes.WinError(ctypes.get_last_error())
            if kernel.ResumeThread(info.thread) == 0xFFFFFFFF:
                raise ctypes.WinError(ctypes.get_last_error())
        except BaseException:
            self.close()
            raise
        finally:
            if info.thread:
                kernel.CloseHandle(info.thread)

    def poll(self):
        result = w.DWORD()
        if not kernel.GetExitCodeProcess(self.process, ctypes.byref(result)):
            raise ctypes.WinError(ctypes.get_last_error())
        return None if result.value == 259 else result.value

    def close(self):
        if self.job:
            kernel.TerminateJobObject(self.job, 1)
            kernel.CloseHandle(self.job)
            self.job = None
        if self.process:
            kernel.WaitForSingleObject(self.process, 5000)
            kernel.CloseHandle(self.process)
            self.process = None
