with
subpoints  as (select * from lex_docs where kind = 'Subpoint'),
points     as (select * from lex_docs where kind = 'Point'),
paragraphs as (select * from lex_docs where kind = 'Paragraph'),
articles   as (select * from lex_docs where kind = 'Article'),
chapters   as (select * from lex_docs where kind = 'Chapter'),
allkinds as (
  select * from subpoints
  union all
  select * from points where points.point_no in (select point_no from subpoints)
)

select
  array[ chapter_no, article_no, paragraph_no, point_no, subpoint_no ] as lex_id,
  content
  from allkinds
order by
  no_to_int(chapter_no),
  no_to_int(article_no),
  no_to_int(paragraph_no),
  no_to_int(point_no),
  no_to_int(subpoint_no)

\x

