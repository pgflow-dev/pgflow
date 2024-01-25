explain analyze with paragraphs as (
  select id, content, chapter_no, article_no, paragraph_no
  from lex_docs where kind = 'Paragraph' and article_no = '130'
),
points as (
  select ld.id, ld.content, ld.chapter_no, ld.article_no, ld.paragraph_no, ld.point_no
  from lex_docs ld
  right join paragraphs p
    on ld.chapter_no = p.chapter_no
    and ld.article_no = p.article_no
    and ld.paragraph_no = p.paragraph_no
  where ld.kind = 'Point'
),
subpoints as (
  select ld.id, ld.content, ld.chapter_no, ld.article_no, ld.paragraph_no, ld.point_no, ld.subpoint_no
  from lex_docs ld
  right join points p
    on ld.chapter_no = p.chapter_no
    and ld.article_no = p.article_no
    and ld.paragraph_no = p.paragraph_no
    and ld.point_no = p.point_no
  where ld.kind = 'Subpoint'
)
select chapter_no, article_no, paragraph_no, point_no, subpoint_no, content from (
  select *, null as point_no, null as subpoint_no from paragraphs
  union
  select *, null as subpoint_no from points
  union
  select * from subpoints
) as sq
order by no_to_int(sq.chapter_no), no_to_int(sq.article_no), no_to_int(sq.paragraph_no), no_to_int(sq.point_no), no_to_int(sq.subpoint_no)
limit 10
\x
