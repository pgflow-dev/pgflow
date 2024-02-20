drop view if exists lex_docs;

create view lex_docs as
select
  id,
  content,
  metadata->>'kind' as kind,
  metadata->>'source' as source,
  metadata->>'chapter_no' as chapter_no,
  metadata->>'article_no' as article_no,
  metadata->>'paragraph_no' as paragraph_no,
  metadata->>'point_no' as point_no,
  metadata->>'subpoint_no' as subpoint_no,
  embedding
from documents
where metadata->>'kind' IN ('Chapter', 'Article', 'Paragraph', 'Point', 'Subpoint');

create index lex_docs_kind_idx on documents ((metadata->>'kind'));
create index lex_docs_source_idx on documents ((metadata->>'source'));
create index lex_docs_chapter_no_idx on documents ((metadata->>'chapter_no'));
create index lex_docs_article_no_idx on documents ((metadata->>'article_no'));
create index lex_docs_paragraph_no_idx on documents ((metadata->>'paragraph_no'));
create index lex_docs_point_no_idx on documents ((metadata->>'point_no'));
create index lex_docs_subpoint_no_idx on documents ((metadata->>'subpoint_no'));
create index lex_docs_idx on documents ((metadata->>'kind' IN ('Chapter', 'Article', 'Paragraph', 'Point', 'Subpoint')));
