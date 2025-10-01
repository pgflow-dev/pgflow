You are tasked with updating an existing note file from "notes" folder.
The folder path is: !`realpath $notes`

There are following files:

<list>
!`ls $notes/`
</list>

User instructions/description:

<instructions>
$ARGUMENTS
</instructions>

Your task:

1. Find the file(s) that most closely match the user's query/description in $ARGUMENTS
2. Present user with choices as a/b/c/d/e format:
   a) fileA.md
   b) fileB.md
   - Even if there is only ONE matching file, still present it and ask for confirmation
   - If no file matches well, suggest closest matches
3. WAIT for user to confirm the choice before proceeding

IMPORTANT: NEVER proceed to update without explicit user confirmation of the file.

Once the user confirms the file:

4. Read the current content of the file
5. Analyze the recent conversation to understand what new information needs to be added
6. Use the $ARGUMENTS to understand:
   - What updates are needed
   - What new information to include
   - What to modify or remove
   - How to restructure if needed

7. Update the file by:
   - Preserving existing valuable content
   - Integrating new information from the discussion
   - Maintaining clear structure and sections
   - Ensuring the document remains coherent and well-organized
   - Adding any relevant new code examples or technical details

IMPORTANT: Update the EXISTING file. Do not create a new one.
