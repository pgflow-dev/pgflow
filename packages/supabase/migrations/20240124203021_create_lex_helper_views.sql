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
where metadata->>'kind' IN ('Chapter', 'Article', 'Paragraph', 'Point', 'Subpoint')
