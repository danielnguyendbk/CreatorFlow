alter table agent_credentials add column generation bigint not null default 1 check(generation>0);
create table agent_credential_rotations(
    id uuid primary key,agent_id uuid not null references local_agents(id),generation bigint not null,
    state varchar(12) not null default 'REQUESTED' check(state in ('REQUESTED','COMMITTED','ACKED','CANCELLED')),
    candidate_hash char(64),created_at timestamptz not null default now(),committed_at timestamptz,ack_at timestamptz,
    requested_by varchar(80) not null,unique(agent_id,generation));
create unique index agent_one_rotation on agent_credential_rotations(agent_id) where state in ('REQUESTED','COMMITTED');
create table agent_identity_audit(id bigserial primary key,agent_id uuid references local_agents(id),generation bigint,
    type varchar(40) not null,actor varchar(80) not null,created_at timestamptz not null default now());
create table agent_enrollment_policy(id int primary key check(id=1),enabled_until timestamptz,updated_by varchar(80));
insert into agent_enrollment_policy(id) values(1);
create table agent_retention_policy(id int primary key check(id=1),logs_days int not null default 7 check(logs_days between 1 and 365),
    temporary_worktree_days int not null default 7 check(temporary_worktree_days between 1 and 365),
    artifact_metadata_days int not null default 90 check(artifact_metadata_days between 30 and 3650),
    preserve_referenced boolean not null default true check(preserve_referenced),updated_by varchar(80));
insert into agent_retention_policy(id) values(1);
