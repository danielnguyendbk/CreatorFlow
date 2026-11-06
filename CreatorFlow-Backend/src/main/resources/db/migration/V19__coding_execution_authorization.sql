create table coding_execution_capabilities(
 agent_id uuid primary key references local_agents(id),session_id uuid not null,cli_version varchar(40),
 protocol_supported boolean not null,sandbox_verified boolean not null,error_code varchar(48),
 evidence_hash char(64) not null,observed_at timestamptz not null default now());
create table coding_executions(
 id uuid primary key,workspace_id uuid not null references coding_workspaces(id),agent_id uuid not null references local_agents(id),
 request_key varchar(64) not null unique,contract jsonb not null,contract_hash char(64) not null,
 state varchar(32) not null default 'DRAFT' check(state in ('DRAFT','AUTHORIZED','BLOCKED','CLAIMED','RUNNING','CANCEL_REQUESTED','CANCELLED','FAILED','REVIEW_REQUIRED','NEEDS_RECONCILIATION')),
 authorization_id uuid,session_id uuid,attempt int not null default 0,lease_expires_at timestamptz,started_at timestamptz,
 admission_id uuid references coding_admissions(id),checkpoint_id uuid,error_code varchar(48),
 diff text,changed_files jsonb,diff_sha256 char(64),evidence_hash char(64),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table coding_execution_authorizations(
 id uuid primary key,execution_id uuid not null references coding_executions(id),contract_hash char(64) not null,
 credential_generation bigint not null,operator_id varchar(80) not null,issued_at timestamptz not null default now(),expires_at timestamptz not null,
 revoked_at timestamptz,unique(execution_id,id));
alter table coding_executions add foreign key(authorization_id) references coding_execution_authorizations(id);
create unique index coding_execution_one_writer on coding_executions(workspace_id) where state in ('AUTHORIZED','CLAIMED','RUNNING','CANCEL_REQUESTED');
create unique index coding_execution_agent_writer on coding_executions(agent_id) where state in ('CLAIMED','RUNNING','CANCEL_REQUESTED');
create table coding_execution_events(id bigserial primary key,execution_id uuid not null references coding_executions(id),type varchar(48) not null,actor varchar(80) not null,created_at timestamptz not null default now());
create function coding_execution_contract_immutable() returns trigger language plpgsql as $$begin
 if new.contract is distinct from old.contract or new.contract_hash<>old.contract_hash or new.workspace_id<>old.workspace_id or new.agent_id<>old.agent_id or new.request_key<>old.request_key then raise exception 'immutable coding execution contract';end if;
 return new;end$$;
create trigger coding_execution_contract_immutable before update on coding_executions for each row execute function coding_execution_contract_immutable();
