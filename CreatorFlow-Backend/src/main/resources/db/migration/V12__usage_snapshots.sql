create table ai_usage_snapshots (
    id uuid primary key,
    agent_id uuid not null references local_agents(id),
    sequence bigint not null check(sequence>0),
    observed_at timestamptz not null,
    received_at timestamptz not null default now(),
    status varchar(32) not null,
    payload jsonb not null,
    unique(agent_id,sequence)
);
create index usage_agent_history on ai_usage_snapshots(agent_id,sequence desc);
create table usage_refresh_requests (
    agent_id uuid primary key references local_agents(id),
    requested_at timestamptz not null default now(),
    completed_at timestamptz
);
