alter table assets add column validation_status varchar(16) not null default 'UNVERIFIED';
alter table assets add column validated_at timestamptz;
create index idx_assets_unverified on assets(id) where validation_status='UNVERIFIED';
