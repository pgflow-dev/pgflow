# note-review

**Use when user asks to:**
- Review notes in a topic or across topics
- Audit notes for relevance to current codebase
- Organize/clean up notes (migrate, archive, delete)
- Verify that notes still apply to current code

## Overview

Interactive note review and organization skill. Analyzes note summaries to intelligently batch related notes, then guides user through decisions (move/archive/delete/keep). Uses clustering analysis to group similar notes together, reducing decision fatigue while maintaining flexibility for edge cases.

## Table of Contents

1. [Workflow](#workflow)
2. [Scope Parsing](#scope-parsing)
3. [Clustering Analysis](#clustering-analysis)
4. [Decision Options](#decision-options)
5. [Execution](#execution)
6. [Sequential Fallback](#sequential-fallback)
7. [Code Verification](#code-verification)

---

## Workflow

The skill follows this process:

```
1. Parse user intent
   ↓
2. Confirm/disambiguate scope
   ↓
3. Get note list for scope
   ↓
4. Summarize all notes
   ↓
5. Analyze summaries → Identify clusters
   ↓
6. Present batch #1 (clustered notes)
   ↓
7. User decides action for batch
   ↓
8. Execute decision
   ↓
9. Repeat for remaining batches
   ↓
10. Sequential review for unclustered notes
```

## Scope Parsing

Flexibly interpret user's intent to determine which notes to review.

### Examples of User Intent

- "Review __scratch topic" → Topic scope
- "Review all notes related to migrations" → Search-based scope
- "Review notes that mention 'pgmq'" → Content search scope
- "Review notes in core and client packages" → Multiple topics
- "Review all notes" → Full scope (all topics)
- "Review WIP notes" → Filename pattern scope

### Confirmation Step

If user request is ambiguous or matches multiple interpretations, use AskUserQuestion to clarify:

```
Which notes would you like to review?
- Specific topic: __scratch
- Specific topic: core
- All topics
- Notes matching keyword: [search term]
- Multiple selected topics
- Other custom selection
```

If match is clear (e.g., exactly one matching topic), proceed without asking.

## Clustering Analysis

After getting summaries, analyze them to group related notes.

### Clustering Criteria

Group notes together if they:
- Belong to the same topic/domain (schema changes, migrations, API design)
- Reference the same code locations or file
- Share the same concept or problem they're trying to solve
- Should be moved to same destination or archived together
- Should be deleted as a group (outdated/duplicate content)

### Analysis Output

Present notes as a table:
```
| Note Title | Summary | Likely Topic |
|---|---|---|
| Migration strategy | Discussion of approaches to db migrations | core |
| pgmq implementation | Notes on pgmq queue patterns | core |
| ... | ... | ... |
```

Then identify clusters:
```
Cluster 1: Database Migrations (2 notes)
- Migration strategy
- pgmq implementation

Cluster 2: API Design (1 note)
- REST endpoints

Cluster 3: Deletion Candidates (1 note)
- Old workspace notes
```

**Confidence Rule**: Only batch notes together if confident they should have the same outcome. If unsure, leave as single note for sequential review.

## Decision Options

For each batch or individual note, present options:

### Primary Actions
- **Move to topic**: Select from existing topics or create new topic
- **Archive**: Mark note as archived
- **Delete**: Remove note permanently (requires confirmation)
- **Skip/Defer**: Leave for manual review later

### Supplementary Options
- **Read full note**: View complete content before deciding
- **Show summaries**: Display detailed summaries for all notes in batch
- **Verify code**: Offer to read relevant code sections to compare against note
- **Split batch**: Break batch into smaller groups if unsure about unified decision

### Code Verification Flow

When user chooses "Verify code":
1. Identify code locations mentioned in note
2. Read relevant codebase sections (using Bash/Read tools)
3. Compare current implementation against note content
4. Present findings:
   - "Note is current" - implementation matches
   - "Note is partially outdated" - some parts changed
   - "Note is completely outdated" - major changes
   - "Need more context" - unclear from code alone
5. User can then decide action (update note, archive, delete, keep)

## Execution

Apply user's decision using appropriate tools:

### Move Decision
```bash
# Use Bash to move note file to destination topic
mv <source_path> <destination_path>
git -C ./.notes add <destination_path>
```

### Archive Decision
```bash
# Rename file with [ARCHIVED] prefix
mv <note_path> <note_dir>/[ARCHIVED] <note_title>.md
git -C ./.notes add <note_dir>
```

### Delete Decision
```bash
# Remove file with git
rm <note_path>
git -C ./.notes add <note_dir>
```

After any change, commit using notes-sync skill or manual git commit.

## Sequential Fallback

After batch decisions complete, process remaining unclustered notes one at a time.

For each note:
1. Show title and summary
2. Display decision options (same as batch)
3. User chooses action
4. Execute and move to next note

This maintains the same UX while handling edge cases that didn't cluster.

## Code Verification

Code verification is user-initiated per note/batch, not automatic.

When user chooses verification:

1. **Identify references**: Extract code file/function names from note
2. **Locate in codebase**: Use Bash/Glob/Grep to find relevant files
3. **Read sections**: Use Read tool to get implementation details
4. **Compare**: Present side-by-side comparison of note vs. current code
5. **Make decision**: User decides if note is still accurate

**Note**: Verification is conceptual (reading + comparing), not scripted. You analyze and summarize findings, then present to user.

## Example Session

```
User: "Review the __scratch topic"

Skill: "Found 5 notes in __scratch. Summarizing..."

[Display table with summaries]

Skill: "Identified clusters:
- Cluster 1: Database patterns (3 notes - migration, pgmq, schema)
- Cluster 2: Old workspace setup (2 notes - dependencies, config)

Review Cluster 1 (database patterns)?
- Move to: core, schema, other topic
- Archive all
- Delete all
- Read full notes
- Skip for now"

User: "Move to core"

Skill: "Moving 3 notes to core topic... Done."

Skill: "Review Cluster 2 (old workspace setup)?
- Move to: [various topics]
- Archive all
- Delete all
- Read full notes
- Skip for now"

User: "Delete all"

Skill: "Delete 2 notes? Confirm: yes/no"

User: "Yes"

Skill: "Deleted. All notes reviewed. Committing changes..."
```
