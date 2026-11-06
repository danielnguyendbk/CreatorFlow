create table local_agents (
    id uuid primary key,
    name varchar(80) not null,
    version varchar(32) not null,
    session_id uuid,
    capabilities jsonb not null default '[]',
    last_heartbeat_at timestamptz,
    created_at timestamptz not null default now()
);
create table agent_credentials (
    agent_id uuid primary key references local_agents(id),
    token_hash varchar(64) not null,
    scope varchar(32) not null default 'AGENT_RUNTIME',
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);
create table agent_tasks (
    id uuid primary key,
    agent_id uuid not null references local_agents(id),
    kind varchar(32) not null check(kind in ('GIT_FIXTURE','FFMPEG_FIXTURE','CAPABILITY_PROBE')),
    state varchar(24) not null default 'QUEUED'
        check(state in ('QUEUED','RUNNING','CANCEL_REQUESTED','SUCCEEDED','FAILED','CANCELLED')),
    attempt integer not null default 0,
    max_attempts integer not null default 3,
    session_id uuid,
    lease_expires_at timestamptz,
    idempotency_key varchar(80) not null unique,
    worktree_key varchar(48) not null,
    timeout_sec integer not null check(timeout_sec between 1 and 60),
    duration_sec integer not null check(duration_sec between 1 and 30),
    result_json jsonb,
    error_code varchar(64),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index agent_one_worktree_writer on agent_tasks(agent_id,worktree_key)
    where state in ('RUNNING','CANCEL_REQUESTED');
create unique index agent_one_active_task on agent_tasks(agent_id)
    where state in ('RUNNING','CANCEL_REQUESTED');
create index agent_queue on agent_tasks(agent_id,created_at) where state='QUEUED';
create table agent_task_events (
    id bigserial primary key,
    task_id uuid not null references agent_tasks(id),
    attempt integer not null,
    type varchar(40) not null,
    created_at timestamptz not null default now()
);
