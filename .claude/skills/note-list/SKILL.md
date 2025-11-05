---
name: note-list
description: List topics or notes in a topic. Use when user says "list topics", "what topics [do I have]", "list notes [in topic]", "show [topic] notes", "what are we working on".
allowed-tools: Bash
---

# Note List

List all topics or notes within a topic.

@../_shared/notes/topics.md

## Workflow

**List topics:**
```bash
./.claude/skills/_shared/notes/list-topics.sh
```

**List notes in topic:**
```bash
./.claude/skills/_shared/notes/list-titles.sh [topic]/

# Add AI summaries for quick overview of content
./.claude/skills/_shared/notes/list-titles.sh [topic]/ | ./.claude/skills/_shared/notes/summarize-notes.sh
```

<tip>
Pipe list results to summarize-notes.sh when:
- User wants to understand what's in the notes without reading them
- Listing returns many notes and user needs context to decide what to read
- Providing a quick overview of a topic's content
</tip>

## Examples

- "list topics" → Show all available topics
- "what topics do I have" → Show all topics
- "list notes in pgflow-demo" → Show all notes in that topic
- "show ci-optimization notes" → List notes with titles
- "what are we working on" → List all topics

@../_shared/notes/notes-layout.md
