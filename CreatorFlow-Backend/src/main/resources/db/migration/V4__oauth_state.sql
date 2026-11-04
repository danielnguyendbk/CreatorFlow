create table oauth_states (
  state_hash char(64) primary key,
  platform varchar(32) not null,
  expires_at timestamptz not null
);
create index idx_oauth_state_expiry on oauth_states(expires_at);
