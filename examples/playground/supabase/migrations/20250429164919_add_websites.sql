create table public.websites (
  id SERIAL primary key,
  website_url TEXT not null,
  sentiment FLOAT not null,
  summary TEXT not null,
  tags TEXT [] not null default '{}',
  created_at TIMESTAMP WITH TIME ZONE default NOW() not null,
  updated_at TIMESTAMP WITH TIME ZONE default NOW() not null
);

create index idx_websites_url on public.websites (website_url);
