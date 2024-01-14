create extension if not exists vector;

create table public.edulaw_articles (
  number text not null primary key,
  text text not null,
  embedding vector(1024)
);

create table public.edulaw_acts (
  number text not null,
  article_number text not null,
  text text not null,
  embedding vector(1024),
  primary key (number, article_number)
);

create table public.edulaw_sections (
  number text not null,
  article_number text not null,
  act_number text,
  text text not null,
  embedding vector(1024),
  primary key (number, act_number, article_number)
);

create or replace function match_articles (
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
returns table (
  number text,
  text text,
  similarity float
)
language sql stable
as $$
  select
    edulaw_articles.number,
    edulaw_articles.text,
    1 - (edulaw_articles.embedding <=> query_embedding) as similarity
  from edulaw_articles
  where 1 - (edulaw_articles.embedding <=> query_embedding) > match_threshold
  order by (edulaw_articles.embedding <=> query_embedding) asc
  limit match_count;
$$;
