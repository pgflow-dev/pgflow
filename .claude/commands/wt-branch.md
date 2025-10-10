You are tasked with creating a new git worktree branch using the 'wt' tool based on the recent discussion context and/or user instructions.

## User Instructions

<instructions>
$ARGUMENTS
</instructions>

## Context

Analyze the recent conversation history to understand:
- What feature, fix, or change is being worked on
- Any specific naming preferences mentioned
- The nature of the work (feature, fix, refactor, docs, etc.)

## Your Task

### Step 1: Analyze and Generate Branch Name

Based on the conversation context and user instructions, generate a descriptive branch name that:

1. **Follows strict naming conventions:**
   - Use ONLY alphanumeric characters and dashes
   - NO slashes, underscores, or special characters
   - Use lowercase with hyphens (kebab-case)
   - Be descriptive but concise (3-5 words max)
   - Include a prefix word if appropriate: `feature-`, `fix-`, `docs-`, `refactor-`, `test-`, etc.

2. **Reflects the work being done:**
   - Feature implementation: `feature-name-of-feature`
   - Bug fix: `fix-description-of-fix`
   - Documentation: `docs-what-docs-changed`
   - Refactoring: `refactor-what-refactored`
   - Tests: `test-what-tested`
   - Chore/maintenance: `chore-what-maintained`

3. **Examples:**
   - `feature-workflow-execution-api`
   - `fix-dsl-type-inference`
   - `docs-setup-guide`
   - `refactor-step-state-handling`
   - `test-array-step-tests`

### Step 2: Present the Plan

Show the user:
1. The generated branch name
2. A brief explanation of why this name was chosen
3. The command that will be executed

### Step 3: Create the Branch

Execute the command using fish with proper sourcing:

```bash
fish -c "source ~/.dotfiles/wt/wt.fish && wt branch <generated-name> --switch --force"
```

**IMPORTANT:**
- Always use `--switch` to automatically switch to the new worktree
- Always use `--force` to skip confirmation prompts
- Make sure to properly source the wt.fish file before calling wt
- Branch name must only contain alphanumeric characters and dashes

### Step 4: Confirm Success

After execution, confirm that:
1. The branch was created successfully
2. The worktree was created
3. The user is now in the new worktree (if --switch was used)

## Example

If the user is discussing implementing a new error handling system:

```
Based on our discussion about implementing error handling for the workflow engine, I'll create a branch named:

  feature-workflow-error-handling

This name reflects that we're adding a new feature (error handling) to the workflow system.

Creating branch and worktree...
```

Then execute:
```bash
fish -c "source ~/.dotfiles/wt/wt.fish && wt branch feature-workflow-error-handling --switch --force"
```
