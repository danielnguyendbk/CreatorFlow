create table agent_task_checkpoints (
    task_id uuid not null references agent_tasks(id) on delete cascade,
    attempt integer not null,
    phase varchar(32) not null default 'ARTIFACT_READY',
    result_json jsonb not null,
    created_at timestamptz not null default now(),
    primary key(task_id,attempt)
);
create table cycle_handoffs (
    cycle_id uuid primary key references agent_cycles(id) on delete cascade,
    document jsonb not null,
    document_hash varchar(64) not null,
    exported_hash varchar(64),
    created_at timestamptz not null default now()
);
