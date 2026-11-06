alter table agent_cycles add column state varchar(24) not null default 'QUEUED'
    check(state in ('QUEUED','RUNNING','PAUSED','CANCEL_REQUESTED','CANCELLED','SUCCEEDED','FAILED'));
update agent_cycles c set state=case
    when not exists(select 1 from agent_tasks t where t.cycle_id=c.id and t.state<>'SUCCEEDED') then 'SUCCEEDED'
    when not exists(select 1 from agent_tasks t where t.cycle_id=c.id and t.state in ('QUEUED','RUNNING','CANCEL_REQUESTED')) then 'FAILED'
    else 'RUNNING' end;
create table cycle_control_events(id bigserial primary key,cycle_id uuid not null references agent_cycles(id) on delete cascade,
    state varchar(24) not null,created_at timestamptz not null default now());
create table telegram_bots(
    identity varchar(48) primary key,bot_id bigint not null unique check(bot_id>0),
    token_env varchar(80) not null check(token_env ~ '^TELEGRAM_[A-Z0-9_]*TOKEN$'),
    next_offset bigint not null default 0,availability varchar(40) not null default 'UNKNOWN',
    last_poll_at timestamptz,last_send_at timestamptz,last_successful_send_at timestamptz,error_code varchar(40),
    poll_lease uuid,poll_until timestamptz,next_poll_at timestamptz not null default now(),failures int not null default 0);
create table telegram_routes(
    bot_identity varchar(48) not null references telegram_bots(identity),chat_id bigint not null check(chat_id<>0),
    kind varchar(8) not null check(kind in ('CODE','CONTENT','VIDEO')),
    can_control boolean not null default false,can_approve boolean not null default false,
    primary key(bot_identity,chat_id));
create table telegram_operators(
    bot_identity varchar(48) not null,chat_id bigint not null,user_id bigint not null check(user_id>0),
    role varchar(12) not null check(role in ('READER','OPERATOR','ADMIN','REVOKED')),last_command_at timestamptz,
    primary key(bot_identity,chat_id,user_id),
    foreign key(bot_identity,chat_id) references telegram_routes(bot_identity,chat_id));
create table telegram_updates(
    bot_identity varchar(48) not null references telegram_bots(identity),update_id bigint not null,
    outcome varchar(32) not null,created_at timestamptz not null default now(),primary key(bot_identity,update_id));
create table control_approvals(
    id uuid primary key,cycle_id uuid not null references agent_cycles(id),
    entity_type varchar(20) not null default 'FIXTURE_CYCLE' check(entity_type='FIXTURE_CYCLE'),
    action varchar(24) not null default 'FIXTURE_REVIEW' check(action='FIXTURE_REVIEW'),
    bot_identity varchar(48) not null,chat_id bigint not null,required_operator bigint not null,
    state varchar(12) not null default 'PENDING' check(state in ('PENDING','APPROVED','REJECTED','EXPIRED')),
    expires_at timestamptz not null,decision_actor bigint,decision_at timestamptz,
    evidence_ref uuid not null references agent_cycles(id),
    foreign key(bot_identity,chat_id,required_operator) references telegram_operators(bot_identity,chat_id,user_id));
create table telegram_outbox(
    id uuid primary key,bot_identity varchar(48) not null,chat_id bigint not null,
    dedupe_key varchar(180) not null unique,ref_type varchar(24) not null,ref_id varchar(80) not null,
    body varchar(3500) not null,state varchar(16) not null default 'PENDING'
        check(state in ('PENDING','SENDING','SENT','RETRY','UNKNOWN','DEAD_LETTER')),
    attempts int not null default 0,next_at timestamptz not null default now(),lease_until timestamptz,
    message_id bigint,error_code varchar(40),created_at timestamptz not null default now(),
    foreign key(bot_identity,chat_id) references telegram_routes(bot_identity,chat_id));
create index telegram_outbox_ready on telegram_outbox(next_at) where state in ('PENDING','RETRY');

-- Event/outbox rows commit together. No task result, prompt or raw provider response is copied.
create function telegram_task_event() returns trigger language plpgsql as $$
begin
    insert into telegram_outbox(id,bot_identity,chat_id,dedupe_key,ref_type,ref_id,body)
    select gen_random_uuid(),r.bot_identity,r.chat_id,'task-event:'||new.id||':'||r.bot_identity||':'||r.chat_id,
        'TASK',new.task_id::text,'Task '||new.task_id||' attempt '||new.attempt||': '||new.type
    from telegram_routes r where r.kind='CODE' on conflict(dedupe_key) do nothing;
    return new;
end $$;
create trigger telegram_task_event after insert on agent_task_events for each row execute function telegram_task_event();
create function telegram_cycle_event() returns trigger language plpgsql as $$
begin
    insert into telegram_outbox(id,bot_identity,chat_id,dedupe_key,ref_type,ref_id,body)
    select gen_random_uuid(),r.bot_identity,r.chat_id,'cycle-event:'||new.id||':'||r.bot_identity||':'||r.chat_id,
        'CYCLE',new.cycle_id::text,'Cycle '||new.cycle_id||': '||new.state
    from telegram_routes r where r.kind='CODE' on conflict(dedupe_key) do nothing;
    return new;
end $$;
create trigger telegram_cycle_event after insert on cycle_control_events for each row execute function telegram_cycle_event();

create function telegram_activity_event() returns trigger language plpgsql as $$
declare group_kind text;
begin
    if new.entity_id is null then return new; end if;
    group_kind=case when new.type in ('CONTENT_CREATED','SCRIPT_GENERATED','STORYBOARD_GENERATED') then 'CONTENT'
        when new.type in ('ASSET_UPLOADED','ASSET_READY','RENDER_STARTED','RENDER_COMPLETED','RENDER_FAILED','PUBLICATION_SCHEDULED','PUBLICATION_COMPLETED','PUBLICATION_FAILED') then 'VIDEO' else null end;
    if group_kind is null then return new; end if;
    insert into telegram_outbox(id,bot_identity,chat_id,dedupe_key,ref_type,ref_id,body)
    select gen_random_uuid(),r.bot_identity,r.chat_id,'activity:'||new.id||':'||r.bot_identity||':'||r.chat_id,
        'ACTIVITY',new.id::text,'Event '||new.id||' entity '||new.entity_id||': '||new.type
    from telegram_routes r where r.kind=group_kind on conflict(dedupe_key) do nothing;
    return new;
end $$;
create trigger telegram_activity_event after insert on activity_events for each row execute function telegram_activity_event();
