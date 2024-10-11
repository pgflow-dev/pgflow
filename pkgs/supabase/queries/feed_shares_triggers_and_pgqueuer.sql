\x
delete from feed.shares;
delete from auth.users;


insert into auth.users (id, email) values (
    gen_random_uuid(), 'admin@example.com'
);
-- select * from auth.users;

insert into feed.shares (json_content, owner_id) values
(
    '{ "url": "https://example.com", "title": "Example Site" }'::jsonb,
    (select id from auth.users limit 1)
);
update feed.shares set
    json_content
    = '{ "url": "https://example.com", "title": "Example Site 2" }'::jsonb;
select
    inferred_type,
    id,
    json_content
from feed.shares;

-- select utils.enqueue_job_for_row(
--     'infer_type', 'feed', 'shares', (select id from feed.shares limit 1)
-- )
