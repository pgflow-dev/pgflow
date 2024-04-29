create or replace function match_lex_docs (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter jsonb default '{}'
)
returns table (
  id uuid,
  content text,
  kind text,
  source text,
  chapter_no text,
  article_no text,
  paragraph_no text,
  point_no text,
  subpoint_no text,
  similarity float
)
language sql stable
as $$
  with paragraphs as (
    select id, content, kind, source, embedding, chapter_no, article_no, paragraph_no
    from lex_docs where kind = 'Paragraph'
    and 1 - (embedding <=> query_embedding) > match_threshold
  ),
  points as (
    select ld.id, ld.content, ld.kind, ld.source, ld.embedding, ld.chapter_no, ld.article_no, ld.paragraph_no, ld.point_no
    from lex_docs ld
    right join paragraphs p
      on ld.chapter_no = p.chapter_no
      and ld.article_no = p.article_no
      and ld.paragraph_no = p.paragraph_no
    where ld.kind = 'Point'
    and 1 - (ld.embedding <=> query_embedding) > match_threshold
  ),
  subpoints as (
    select ld.id, ld.content, ld.kind, ld.source, ld.embedding, ld.chapter_no, ld.article_no, ld.paragraph_no, ld.point_no, ld.subpoint_no
    from lex_docs ld
    right join points p
      on ld.chapter_no = p.chapter_no
      and ld.article_no = p.article_no
      and ld.paragraph_no = p.paragraph_no
      and ld.point_no = p.point_no
    where ld.kind = 'Subpoint'
    and 1 - (ld.embedding <=> query_embedding) > match_threshold
  )
  select id, content, kind, source, chapter_no, article_no, paragraph_no, point_no, subpoint_no,
    1 - (sq.embedding <=> query_embedding) as similarity
  from (
    select *, null as point_no, null as subpoint_no from paragraphs
    union
    select *, null as subpoint_no from points
    union
    select * from subpoints
  ) as sq
  where chapter_no = filter->>'chapter_no'
  and article_no = filter->>'article_no'
  and paragraph_no = filter->>'paragraph_no'
  and point_no = filter->>'point_no'
  and subpoint_no = filter->>'subpoint_no'
  order by
    no_to_int(sq.chapter_no),
    no_to_int(sq.article_no),
    no_to_int(sq.paragraph_no),
    no_to_int(sq.point_no),
    no_to_int(sq.subpoint_no)
  limit match_count
$$

-- begin
--   return query
--   select
--     id,
--     content,
--     metadata,
--     1 - (documents.embedding <=> query_embedding) as similarity
--   from documents
--   where metadata @> filter
--   order by documents.embedding <=> query_embedding;
-- end;
-- $$;
