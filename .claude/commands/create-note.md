You are tasked with creating a summary note based on the recent discussion, plan, or research.
The note should be saved in the "notes" folder.
The folder path is: !`realpath $notes`

Existing files in the notes folder:

<list>
!`ls $notes/`
</list>

User instructions/description:

<instructions>
$ARGUMENTS
</instructions>

Your task:

1. Analyze the recent conversation to understand what needs to be summarized
2. Use the $ARGUMENTS to understand:

   - What topic/discussion to summarize
   - How to structure the document
   - What to include or omit
   - Any suggestions for the filename

3. Create a meaningful filename:

   - For implementation plans: PLAN\_<descriptive-name>.md
   - For other content: <descriptive-name>.md
   - Use lowercase with hyphens (e.g., PLAN_workflow-execution.md or typescript-patterns.md)

4. Write a well-structured document that contains:
   - Clear title and sections
   - Enough detail to understand the topic or work on the plan
   - Key decisions, approaches, or learnings from the discussion
   - Any relevant code examples or technical details

IMPORTANT: Always create a NEW file. Never suggest or choose from existing files.
