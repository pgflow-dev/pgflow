You are tasked with auditing a single note file from "notes" folder.
The folder path is: !`realpath $notes`

Available files:

<list>
!`ls $notes/`
</list>

You must find the file that most closely matches this user query: "$ARGUMENTS".

If there are multiple files matching, present user with a/b/c choice and wait for confirmation.
If you are certain there is only one file that strongly matches, proceed with audit.

## Two-Phase Audit Process

### Phase 1: Quick Heuristics (try this first)

1. Read the note file
2. Extract key terms, features, file paths, or function names mentioned
3. Run simple checks:
   - Grep for key terms in the codebase
   - Glob for mentioned file paths
   - Check if described features/patterns exist
4. Based on results, determine:
   - **IMPLEMENTED** - Key terms/files/patterns found in codebase
   - **INVALID** - Note contradicts current code or mentions non-existent paths
   - **UNCLEAR** - Heuristics inconclusive, need deeper analysis

### Phase 2: Deep Audit (only if Phase 1 returns UNCLEAR)

If heuristics fail, spawn a Task agent with this prompt:

```
Read {filepath} and deeply analyze against the codebase.

Determine if the note is:
- IMPLEMENTED: Feature/plan already exists in code
- INVALID: Outdated, contradicts current implementation, or not applicable
- VALID: Still relevant and could be worked on

Return:
STATUS: [IMPLEMENTED|INVALID|VALID]
EXPLANATION: [1-2 sentences why]
```

## Output Format

Present results clearly:

```
# Audit: {filename}

Status: [IMPLEMENTED|INVALID|VALID|UNCLEAR]

Explanation: [Brief explanation based on findings]

[If heuristics were used, show what was searched/found]
[If deep audit was needed, show agent's analysis]
```
