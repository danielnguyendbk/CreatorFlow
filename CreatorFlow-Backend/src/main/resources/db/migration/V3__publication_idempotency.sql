create unique index idx_unique_publication_target on publication_jobs(content_id,platform)
where status in ('DRAFT','SCHEDULED','PUBLISHING','PUBLISHED','RETRYING');
