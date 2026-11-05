-- Keep every historical row. Only the canonical row can own a publication target.
alter table publication_jobs add column superseded_by uuid references publication_jobs(id);
alter table publication_jobs add column reconciliation_required boolean not null default false;
alter table publication_jobs add column failure_category varchar(40);

with ranked as (
    select id, content_id, platform,
           first_value(id) over target as canonical_id,
           row_number() over target as rank
    from publication_jobs
    window target as (partition by content_id, platform order by
        case when platform_post_id is not null then 0 when status='PUBLISHED' then 1
             when status='PUBLISHING' then 2 when status='SCHEDULED' then 3
             when status='RETRYING' then 4 when status='DRAFT' then 5 else 6 end,
        created_at desc, id)
)
update publication_jobs p set superseded_by=r.canonical_id, updated_at=now()
from ranked r where p.id=r.id and r.rank>1;

-- Distinct remote IDs represent a case that cannot be resolved from local history.
with conflicting as (
    select content_id, platform from publication_jobs
    where platform_post_id is not null
    group by content_id, platform having count(distinct platform_post_id)>1
)
update publication_jobs p set reconciliation_required=true,
    failure_category='HISTORICAL_CONFLICT', updated_at=now()
from conflicting c where p.content_id=c.content_id and p.platform=c.platform;

-- An in-flight upload without a remote ID may already have succeeded.
update publication_jobs set reconciliation_required=true,
    failure_category='UPLOAD_OUTCOME_UNKNOWN', updated_at=now()
where status='PUBLISHING' and platform_post_id is null;

drop index idx_unique_publication_target;
create unique index idx_unique_publication_canonical
    on publication_jobs(content_id,platform) where superseded_by is null;
create index idx_publication_superseded on publication_jobs(superseded_by)
    where superseded_by is not null;
