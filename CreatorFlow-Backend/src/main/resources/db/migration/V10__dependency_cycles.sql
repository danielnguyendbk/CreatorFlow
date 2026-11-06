create table agent_cycles (
    id uuid primary key,
    idempotency_key varchar(80) not null unique,
    request_hash varchar(64) not null,
    created_at timestamptz not null default now()
);
alter table agent_tasks add column cycle_id uuid references agent_cycles(id);
alter table agent_tasks add column node_key varchar(48);
alter table agent_tasks add column not_before timestamptz not null default now();
create unique index cycle_node_key on agent_tasks(cycle_id,node_key);
create table agent_task_dependencies (
    task_id uuid not null references agent_tasks(id),
    depends_on_id uuid not null references agent_tasks(id),
    primary key(task_id,depends_on_id),
    check(task_id<>depends_on_id)
);
