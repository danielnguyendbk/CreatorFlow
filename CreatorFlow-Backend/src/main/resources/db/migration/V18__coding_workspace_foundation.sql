alter table agent_tasks drop constraint agent_tasks_kind_check;
alter table agent_tasks add constraint agent_tasks_kind_check check(kind in ('GIT_FIXTURE','FFMPEG_FIXTURE','CAPABILITY_PROBE','WORKTREE_PREPARE','WORKTREE_INSPECT','WORKTREE_CLEANUP','CODING_PREFLIGHT'));
create table coding_repositories(
    id uuid primary key,agent_id uuid not null references local_agents(id),canonical_path varchar(512) not null,
    remote_url varchar(512) not null,allowed_bases jsonb not null,protected_branches jsonb not null,
    enabled boolean not null default true,verification varchar(32) not null default 'PENDING',verified_commits jsonb not null default '{}',
    config_hash char(64) not null,approved_by varchar(80) not null,approved_at timestamptz not null default now(),
    verified_at timestamptz,error_code varchar(48),unique(agent_id,canonical_path));
create table agent_provider_capabilities(agent_id uuid not null references local_agents(id),provider varchar(16) not null,
    installed boolean not null,version varchar(40),observed_at timestamptz not null default now(),primary key(agent_id,provider));
create table coding_budget_policies(id uuid primary key,agent_id uuid not null references local_agents(id),provider varchar(16) not null,
    enabled boolean not null default false,operator_authorized boolean not null default false,max_concurrent int not null check(max_concurrent between 1 and 4),
    max_duration_sec int not null check(max_duration_sec between 1 and 60),max_attempts int not null check(max_attempts between 1 and 3),
    max_reserved_seconds int not null check(max_reserved_seconds between 1 and 720),approved_by varchar(80) not null,
    updated_at timestamptz not null default now(),unique(agent_id,provider));
create table coding_admissions(id uuid primary key,agent_id uuid not null references local_agents(id),policy_id uuid references coding_budget_policies(id),
    provider varchar(16) not null,state varchar(24) not null check(state in ('READY','WAIT_FOR_RESET','OPERATOR_REQUIRED','PROVIDER_UNSUPPORTED','DISABLED')),
    reason varchar(48) not null,request_hash char(64) not null,reserved_seconds int not null default 0,reserved_until timestamptz,
    created_at timestamptz not null default now());
create table coding_workspaces(
    id uuid primary key,repository_id uuid not null references coding_repositories(id),agent_id uuid not null references local_agents(id),
    base_ref varchar(100) not null,base_commit varchar(64) not null,branch varchar(80) not null unique,
    state varchar(32) not null default 'REQUESTED',relative_path varchar(80) not null unique,
    allocation_task_id uuid not null references agent_tasks(id),current_task_id uuid references agent_tasks(id),
    owner_session uuid,owner_attempt int,lease_expires_at timestamptz,writer_locked boolean not null default false,
    last_checkpoint_id uuid,cleanup_state varchar(32) not null default 'RETAINED',created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),error_code varchar(48));
create table coding_task_contracts(task_id uuid primary key references agent_tasks(id) on delete cascade,
    workspace_id uuid not null references coding_workspaces(id),payload jsonb not null,request_hash char(64) not null);
create table coding_workspace_checkpoints(id uuid primary key,workspace_id uuid not null references coding_workspaces(id),
    task_id uuid not null references agent_tasks(id),session_id uuid not null,attempt int not null,
    head_commit varchar(64),dirty boolean not null,state varchar(32) not null,report_hash char(64) not null,
    created_at timestamptz not null default now(),unique(task_id,attempt));
alter table coding_workspaces add foreign key(last_checkpoint_id) references coding_workspace_checkpoints(id);
create table coding_workspace_events(id bigserial primary key,workspace_id uuid references coding_workspaces(id),
    repository_id uuid references coding_repositories(id),type varchar(48) not null,actor varchar(80) not null,
    created_at timestamptz not null default now());
create unique index coding_workspace_one_operation on coding_task_contracts(workspace_id,task_id);
