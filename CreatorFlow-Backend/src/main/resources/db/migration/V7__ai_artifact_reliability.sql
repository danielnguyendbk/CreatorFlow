alter table ai_generation_jobs add column artifact_id uuid references storyboards(id);
alter table ai_generation_jobs add column error_category varchar(40);
alter table provider_usage alter column input_tokens drop not null;
alter table provider_usage alter column output_tokens drop not null;
alter table provider_usage alter column input_tokens drop default;
alter table provider_usage alter column output_tokens drop default;

-- Prior versions marked the provider response complete before persisting a board.
update ai_generation_jobs j set artifact_id=s.id
from storyboards s where j.type='STORYBOARD' and j.status='COMPLETED'
    and j.content_id=s.content_id;
update ai_generation_jobs set status='FAILED',error_category='MISSING_ARTIFACT',
    error='Previously completed provider response has no persisted storyboard',updated_at=now()
where type='STORYBOARD' and status='COMPLETED' and artifact_id is null;

alter table ai_generation_jobs add constraint ck_completed_storyboard_artifact
    check(type<>'STORYBOARD' or status<>'COMPLETED' or artifact_id is not null);
create index idx_ai_jobs_running on ai_generation_jobs(status,updated_at)
    where status='RUNNING';
