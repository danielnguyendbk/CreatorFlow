"""Windows child created suspended, assigned to a kill-on-close Job, then resumed.

No shell; only explicit stdio pipes may be inherited. Closing the job kills descendants, including
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
    class Security(ctypes.Structure):
        _fields_ = [("length", w.DWORD), ("descriptor", ctypes.c_void_p), ("inherit", w.BOOL)]
    kernel.CreatePipe.argtypes = [ctypes.POINTER(w.HANDLE), ctypes.POINTER(w.HANDLE), ctypes.POINTER(Security), w.DWORD]
    kernel.SetHandleInformation.argtypes = [w.HANDLE, w.DWORD, w.DWORD]


class JobProcess:
    def __init__(self, argv, cwd, env, piped=False):
        if os.name != "nt":
            raise RuntimeError("Windows agent requires Windows Job Objects")
        self.job = kernel.CreateJobObjectW(None, None)
        self.process = None
        self.stdin = self.stdout = None
        child_handles = []
        info = ProcessInfo()
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            if not self.job or not kernel.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise ctypes.WinError(ctypes.get_last_error())
            startup = Startup()
            startup.cb = ctypes.sizeof(startup)
            if piped:
                import msvcrt
                security = Security(ctypes.sizeof(Security), None, True)
                stdin_read, stdin_write, stdout_read, stdout_write = w.HANDLE(), w.HANDLE(), w.HANDLE(), w.HANDLE()
                if not kernel.CreatePipe(ctypes.byref(stdin_read), ctypes.byref(stdin_write), ctypes.byref(security), 0):
                    raise ctypes.WinError(ctypes.get_last_error())
                child_handles.append(stdin_read)
                if not kernel.CreatePipe(ctypes.byref(stdout_read), ctypes.byref(stdout_write), ctypes.byref(security), 0):
                    kernel.CloseHandle(stdin_write)
                    raise ctypes.WinError(ctypes.get_last_error())
                child_handles.append(stdout_write)
                kernel.SetHandleInformation(stdin_write, 1, 0)
                kernel.SetHandleInformation(stdout_read, 1, 0)
                self.stdin = os.fdopen(msvcrt.open_osfhandle(stdin_write.value, 0), "w", encoding="utf-8", newline="\n", buffering=1)
                self.stdout = os.fdopen(msvcrt.open_osfhandle(stdout_read.value, os.O_RDONLY), "r", encoding="utf-8", errors="replace")
                null_fd = os.open(os.devnull, os.O_WRONLY)
                null_handle = msvcrt.get_osfhandle(null_fd)
                os.set_handle_inheritable(null_handle, True)
                startup.flags = 0x100
                startup.stdin, startup.stdout, startup.stderr = stdin_read, stdout_write, null_handle
            environment = ctypes.create_unicode_buffer("\0".join(f"{k}={v}" for k, v in sorted(env.items())) + "\0\0")
            command = ctypes.create_unicode_buffer(subprocess.list2cmdline([str(a) for a in argv]))
            # CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT
            if not kernel.CreateProcessW(str(argv[0]), command, None, None, piped, 0x08000404,
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
            for handle in child_handles:
                kernel.CloseHandle(handle)
            if piped and 'null_fd' in locals():
                os.close(null_fd)

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
        for stream in (self.stdin, self.stdout):
            if stream:
                try:
                    stream.close()
                except OSError:
                    pass
