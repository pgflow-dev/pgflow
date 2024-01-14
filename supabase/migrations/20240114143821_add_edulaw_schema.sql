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


