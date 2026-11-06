-- Metadata only. Credentials remain owned by the official provider tools.
create table provider_accounts (
    provider varchar(32) primary key,
    display_name varchar(80) not null,
    installed boolean not null default false,
    connection_status varchar(16) not null default 'UNKNOWN'
        check (connection_status in ('CONNECTED','EXPIRED','UNSUPPORTED','UNKNOWN')),
    health_code varchar(64) not null default 'NOT_CHECKED',
    reconnect_capability varchar(16) not null,
    switching_capability varchar(16) not null default 'UNSUPPORTED',
    checked_at timestamptz,
    updated_at timestamptz not null default now()
);
insert into provider_accounts(provider,display_name,reconnect_capability) values
('CODEX_CLI','Codex CLI','SUPPORTED'),
('GEMINI_CLI','Gemini CLI','SUPPORTED'),
('GEMINI_API','Gemini API','UNSUPPORTED'),
('OPENROUTER_API','OpenRouter API','UNSUPPORTED');
create table account_reconnect_intents (
    id uuid primary key,
    provider varchar(32) not null references provider_accounts(provider),
    status varchar(32) not null default 'AWAITING_USER_OFFICIAL_FLOW',
    created_at timestamptz not null default now()
);
