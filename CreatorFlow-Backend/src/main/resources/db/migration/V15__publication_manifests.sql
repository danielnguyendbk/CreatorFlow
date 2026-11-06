alter table social_connections add column connection_revision uuid not null default gen_random_uuid();
create function social_connection_generation() returns trigger language plpgsql as $$
begin
    if (new.encrypted_refresh_token,new.scopes,new.status,new.revoked_at) is distinct from
       (old.encrypted_refresh_token,old.scopes,old.status,old.revoked_at) then new.connection_revision=gen_random_uuid(); end if;
    return new;
end $$;
create trigger social_connection_generation before update on social_connections for each row execute function social_connection_generation();

alter table publication_jobs add column description text not null default '';
alter table publication_jobs add column connection_id uuid references social_connections(id);
alter table publication_jobs add column visibility varchar(12) check(visibility in ('private','unlisted','public'));
alter table publication_jobs add column dispatch_token uuid;
create table artifact_evidence(
    id uuid primary key,asset_id uuid not null references assets(id),sha256 char(64) not null,
    size_bytes bigint not null check(size_bytes>0),duration_millis bigint not null check(duration_millis>0),
    container varchar(100) not null,codecs jsonb not null,created_at timestamptz not null);
create table publication_manifests(
    id uuid primary key,publication_id uuid not null references publication_jobs(id),revision int not null check(revision>0),
    schema_version int not null check(schema_version=1),content_id uuid not null references contents(id),
    storyboard_id uuid not null references storyboards(id),render_id uuid not null references render_jobs(id),
    asset_id uuid not null references assets(id),evidence_id uuid not null references artifact_evidence(id),
    connection_id uuid not null references social_connections(id),connection_revision uuid not null,
    fingerprint char(64) not null,canonical_json text not null,payload jsonb not null,
    created_at timestamptz not null,created_by varchar(80) not null,
    unique(publication_id,revision));
alter table publication_jobs add column active_manifest_id uuid references publication_manifests(id);
create table publication_approvals(
    id uuid primary key,manifest_id uuid not null unique references publication_manifests(id),
    fingerprint char(64) not null,required_operator varchar(80) not null,
    state varchar(16) not null default 'PENDING' check(state in ('PENDING','APPROVED','REJECTED','REVOKED','EXPIRED','INVALIDATED')),
    issued_at timestamptz not null default now(),expires_at timestamptz not null,
    decision_actor varchar(80),decision_at timestamptz,decision_request_id uuid unique,
    decision varchar(8) check(decision in ('APPROVE','REJECT')));
create table publication_audit(
    id uuid primary key,publication_id uuid not null references publication_jobs(id),
    manifest_id uuid references publication_manifests(id),type varchar(40) not null,
    actor varchar(80) not null,created_at timestamptz not null default now());
create function immutable_publication_record() returns trigger language plpgsql as $$
begin raise exception 'Immutable publication evidence' using errcode='23514'; end $$;
create trigger immutable_manifest before update or delete on publication_manifests for each row execute function immutable_publication_record();
create trigger immutable_artifact_evidence before update or delete on artifact_evidence for each row execute function immutable_publication_record();
create trigger immutable_publication_audit before update or delete on publication_audit for each row execute function immutable_publication_record();

create function invalidate_publication_metadata() returns trigger language plpgsql as $$
begin
    if (new.content_id,new.platform,new.title,new.caption,new.description,new.hashtags,new.scheduled_at,new.connection_id,new.visibility)
       is distinct from (old.content_id,old.platform,old.title,old.caption,old.description,old.hashtags,old.scheduled_at,old.connection_id,old.visibility) then
        if old.status in ('PUBLISHING','PUBLISHED') or old.platform_post_id is not null or old.reconciliation_required then
            raise exception 'Publication target is locked or requires reconciliation' using errcode='23514';
        end if;
        if old.active_manifest_id is not null then
            update publication_approvals set state='INVALIDATED' where manifest_id=old.active_manifest_id and state in ('PENDING','APPROVED');
            insert into publication_audit values(gen_random_uuid(),old.id,old.active_manifest_id,'METADATA_INVALIDATED','system:metadata',now());
        end if;
        new.active_manifest_id=null;new.approved_at=null;
    end if;
    return new;
end $$;
create trigger invalidate_publication_metadata before update on publication_jobs for each row execute function invalidate_publication_metadata();
-- Historical approved_at is retained as history, never converted to a P4 approval.
