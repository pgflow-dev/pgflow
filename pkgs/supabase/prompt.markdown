I parse and store polish educational law in order to process/embed it and provide as a context for my AI agents.

The law is structured like this:

```markdown
- Chapter
  - Articles
    - Points
      - Subpoints
    - Paragraphs
      - Points
        - Subpoints
  - Paragraphs
    - Points
      - Subpoints
  - Points
    - Subpoints
```

So, articles are always children of Chapter.
Paragraphs can be children of Chapter or Article.
Point can be children of Chapter, Article or Paragraph.
Subpoint is always children of point.

I have modeled this relationships as explicit multi fkeys:

- Chapters have only chapter_no (primary key)
- Articles have chapter_no and article_no
- Paragraphs have chapter_no, article_no (nullable) and paragraph_no
- Points have chapter_no, article_no (nullable), paragraph_no (nullable) and point_no
- Subpoints have chapter_no, article_no (nullable), paragraph_no (nullable), point_no and subpoint_no
