create schema if not exists edulaw;
create extension if not exists vector;

create table edulaw.articles (
  number text not null primary key,
  content text not null,
  embedding vector(768)
);

create table edulaw.acts (
  number text not null,
  article_number text not null,
  content text not null,
  embedding vector(768),
  primary key (number, article_number)
);

create table edulaw.sections (
  number text not null,
  article_number text not null,
  act_number text,
  content text not null,
  embedding vector(768),
  primary key (number, act_number, article_number)
);


