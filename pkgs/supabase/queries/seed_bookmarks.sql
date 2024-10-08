--                   id                  |      email
-- --------------------------------------+------------------
--  5b130f8e-6ee3-42b0-afda-c5d7f94c4625 | jumski@gmail.com

delete from feed.shares;
insert into feed.shares (json_content, owner_id) values
(
    '{"title": "TechCrunch", "url": "https://techcrunch.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "The Verge", "url": "https://www.theverge.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "Wired", "url": "https://www.wired.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "Ars Technica", "url": "https://arstechnica.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "Gizmodo", "url": "https://gizmodo.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "CNET", "url": "https://www.cnet.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "Engadget", "url": "https://www.engadget.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "Mashable", "url": "https://mashable.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "The Next Web", "url": "https://thenextweb.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
),
(
    '{"title": "The Verge", "url": "https://www.theverge.com"}'::jsonb,
    '5b130f8e-6ee3-42b0-afda-c5d7f94c4625'
)
on conflict do nothing;
