"""Fixed, local-only Git worktree operations. No task-controlled paths or executable arguments."""
import configparser
import json
import os
from pathlib import Path
import re
import shutil
import threading
import time
import uuid
from windows_process import JobProcess

KINDS = ('WORKTREE_PREPARE', 'WORKTREE_INSPECT', 'WORKTREE_CLEANUP', 'CODING_PREFLIGHT')


def plain_path(path):
    path = Path(path).absolute()
    if any(p.is_symlink() or p.is_junction() for p in [path, *path.parents]):
        raise ValueError('REPOSITORY_REJECTED')
    if path.exists() and os.path.normcase(str(path.resolve())) != os.path.normcase(str(path)):
        raise ValueError('REPOSITORY_REJECTED')
    return path


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, sort_keys=True), encoding='utf-8')
    temporary.replace(path)


class WorktreeManager:
    def __init__(self, root, client, session, tick=lambda: None):
        from agent import child_environment
        self.root, self.client, self.session, self.tick = plain_path(root), client, session, tick
        self.git_exe = shutil.which('git.exe')
        self.environment = child_environment()
        self.repositories = {}
        self.allowed_roots = [plain_path(p).resolve() for p in os.environ.get('CREATORFLOW_REPOSITORY_ROOTS', '').split(os.pathsep) if p]
        for name in ('coding-worktrees', 'coding-locks', 'coding-journals', 'disabled-git-hooks'):
            directory = self.root / name
            plain_path(directory).mkdir(exist_ok=True)

    def git(self, arguments, cwd, deadline):
        from agent import TaskError
        if not self.git_exe:
            raise TaskError('TOOL_UNAVAILABLE')
        argv = [self.git_exe, '--no-optional-locks', '-c', 'core.hooksPath=' + str(self.root / 'disabled-git-hooks'),
                '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', '-c', 'credential.helper=',
                '-c', 'core.attributesFile=NUL', '-c', 'protocol.allow=never', '-c', 'core.autocrlf=false', *arguments]
        process = JobProcess(argv, cwd, self.environment, piped=True)
        result, oversized = [], [False]
        def read():
            total = 0
            for chunk in iter(lambda: process.stdout.read(4096), ''):
                total += len(chunk)
                if total > 1024 * 1024:
                    oversized[0] = True
                    return
                result.append(chunk)
        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        try:
            while True:
                if time.monotonic() >= deadline:
                    raise TaskError('TIMEOUT')
                self.tick()
                if oversized[0]:
                    raise TaskError('REPOSITORY_REJECTED')
                code = process.poll()
                if code is not None:
                    reader.join(timeout=1)
                    if reader.is_alive() or oversized[0]:
                        raise TaskError('REPOSITORY_REJECTED')
                    return code, ''.join(result).strip()
                time.sleep(.025)
        finally:
            process.close()

    def required(self, arguments, cwd, deadline):
        code, output = self.git(arguments, cwd, deadline)
        if code:
            raise ValueError('REPOSITORY_REJECTED')
        return output

    def validate_repository(self, repository, deadline):
        path = plain_path(repository['canonicalPath']).resolve()
        if not repository['enabled'] or not self.allowed_roots or not any(path.is_relative_to(root) and path != root for root in self.allowed_roots):
            raise ValueError('REPOSITORY_REJECTED')
        gitdir = plain_path(path / '.git')
        if not gitdir.is_dir():
            raise ValueError('REPOSITORY_REJECTED')
        for name in ('config', 'objects', 'refs', 'hooks', 'worktrees'):
            plain_path(gitdir / name)
        # Never follow includes or execute smudge/clean filters while checking out untrusted content.
        config = gitdir / 'config'
        if config.stat().st_size > 65536 or (gitdir / 'config.worktree').exists():
            raise ValueError('REPOSITORY_REJECTED')
        parser = configparser.ConfigParser(interpolation=None, strict=False)
        parser.read_string(config.read_text(encoding='utf-8'))
        if any(s.lower().startswith(('include', 'filter ', 'filter"')) for s in parser.sections()):
            raise ValueError('REPOSITORY_REJECTED')
        if parser.getboolean('extensions', 'worktreeConfig', fallback=False):
            raise ValueError('REPOSITORY_REJECTED')
        top = Path(self.required(['rev-parse', '--show-toplevel'], path, deadline)).resolve()
        if top != path or self.required(['rev-parse', '--is-bare-repository'], path, deadline) != 'false':
            raise ValueError('REPOSITORY_REJECTED')
        # Git's own current-user repository ownership check runs with global/system config disabled.
        remote = self.required(['config', '--no-includes', '--local', '--get', 'remote.origin.url'], path, deadline)
        if remote != repository['remoteUrl']:
            raise ValueError('REPOSITORY_REJECTED')
        refs = {}
        for branch in repository['allowedBases']:
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9/_-]{0,99}', branch) or '..' in branch or '//' in branch:
                raise ValueError('REPOSITORY_REJECTED')
            refs[branch] = self.required(['rev-parse', '--verify', '--end-of-options', 'refs/heads/' + branch + '^{commit}'], path, deadline)
        return path, refs

    def sync(self):
        rows = self.client.get('coding/repositories?sessionId=' + self.session)
        self.repositories = {r['id']: r for r in rows}
        for repository in rows:
            try:
                _, commits = self.validate_repository(repository, time.monotonic() + 15)
                error = None
            except Exception:
                commits, error = {}, 'LOCAL_REPOSITORY_REJECTED'
            self.client.post('coding/repositories/verify', dict(sessionId=self.session, repositoryId=repository['id'], configHash=repository['configHash'], commits=commits, errorCode=error))

    def execute(self, task):
        from agent import TaskError, exclusive_lock
        if task['kind'] not in KINDS:
            raise TaskError('AGENT_ERROR')
        w = task['workspace']
        workspace_id = str(uuid.UUID(w['id']))
        expected_branch = 'creatorflow/' + workspace_id
        if w['branch'] != expected_branch or w['relativePath'] != 'coding-worktrees/' + workspace_id or w['agentId'] != self.client.identity['id'] or not re.fullmatch(r'[a-f0-9]{40,64}', w['baseCommit']):
            raise TaskError('REPOSITORY_REJECTED')
        deadline = time.monotonic() + task['timeoutSec']
        path = plain_path(self.root / 'coding-worktrees' / workspace_id)
        journal_path = self.root / 'coding-journals' / (workspace_id + '.json')
        checkpoint_id = str(uuid.uuid4())
        report = dict(sessionId=self.session, attempt=task['attempt'], checkpointId=checkpoint_id, state='NEEDS_RECONCILIATION', headCommit=None, dirty=True)
        with exclusive_lock(self.root / 'coding-locks' / (workspace_id + '.lock')):
            try:
                self.sync()
                repository = self.repositories[w['repositoryId']]
                repo, refs = self.validate_repository(repository, deadline)
                if refs.get(w['baseRef']) != w['baseCommit']:
                    raise ValueError('REPOSITORY_REJECTED')
                if expected_branch in repository['protectedBranches'] or not expected_branch.startswith('creatorflow/'):
                    raise ValueError('REPOSITORY_REJECTED')
                tree = self.required(['ls-tree', '-r', w['baseCommit']], repo, deadline)
                if any(line.startswith(('120000 ', '160000 ')) for line in tree.splitlines()):
                    raise ValueError('REPOSITORY_REJECTED')
                certificate = dict(workspaceId=workspace_id, repositoryId=w['repositoryId'], agentId=w['agentId'],
                    allocationTaskId=w['allocationTaskId'], baseCommit=w['baseCommit'], branch=expected_branch, configHash=repository['configHash'])
                if task['kind'] == 'WORKTREE_PREPARE' and not path.exists() and not journal_path.exists():
                    atomic_json(journal_path, dict(certificate, phase='CREATION_INTENT', checkpointId=None))
                    self.required(['worktree', 'add', '-b', expected_branch, str(path), w['baseCommit']], repo, deadline)
                if not journal_path.exists():
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if journal_path.stat().st_size > 16384:
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                journal = json.loads(journal_path.read_text(encoding='utf-8'))
                if any(journal.get(k) != v for k, v in certificate.items()):
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if w.get('lastCheckpointId') and journal.get('checkpointId') != w['lastCheckpointId']:
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if not path.exists():
                    if journal.get('phase') in ('CLEANUP_INTENT', 'CLEANED') and task['kind'] == 'WORKTREE_INSPECT':
                        inventory = self.required(['worktree', 'list', '--porcelain'], repo, deadline)
                        if str(path).replace('\\', '/') in inventory.replace('\\', '/'):
                            raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                        report.update(state='CLEANED', headCommit=w['baseCommit'], dirty=False)
                        atomic_json(journal_path, dict(certificate, phase='CLEANED', checkpointId=checkpoint_id))
                        return report
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                marker = plain_path(path / '.git')
                if not marker.is_file() or marker.stat().st_size > 2048:
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                pointer = Path(marker.read_text(encoding='utf-8').strip().removeprefix('gitdir: ')).resolve()
                if not pointer.is_relative_to((repo / '.git' / 'worktrees').resolve()):
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if Path(self.required(['rev-parse', '--git-common-dir'], path, deadline)).resolve() != (repo / '.git').resolve():
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if self.required(['symbolic-ref', '--quiet', 'HEAD'], path, deadline) != 'refs/heads/' + expected_branch:
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                head = self.required(['rev-parse', '--verify', 'HEAD'], path, deadline)
                dirty = bool(self.required(['status', '--porcelain', '--untracked-files=all', '--ignored'], path, deadline))
                if head != w['baseCommit'] or dirty:
                    raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                if task['kind'] == 'WORKTREE_CLEANUP':
                    if not w.get('lastCheckpointId'):
                        raise ValueError('WORKSPACE_RECONCILIATION_REQUIRED')
                    atomic_json(journal_path, dict(certificate, phase='CLEANUP_INTENT', checkpointId=w['lastCheckpointId']))
                    self.required(['worktree', 'remove', str(path)], repo, deadline)  # Deliberately no --force.
                    phase = 'CLEANED'
                else:
                    phase = 'READY'
                atomic_json(journal_path, dict(certificate, phase=phase, checkpointId=checkpoint_id))
                report.update(state=phase, headCommit=head, dirty=False)
                return report
            except TaskError:
                raise
            except Exception:
                return report
