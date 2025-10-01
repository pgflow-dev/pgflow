You are tasked with finding relevant notes from the "notes" folder.
The folder path is: !`realpath $notes`

Available notes:

<list>
!`ls $notes/`
</list>

User query/context:

<query>
$ARGUMENTS
</query>

Your task:

1. Analyze the user query and current discussion context
2. Identify which note files might be relevant based ONLY on filenames:
   - Filename matching the topic
   - Keywords or themes in the filename
   - Likely relevance based on filename patterns

3. For each potentially relevant file identified by filename, use the Task tool to spawn a general-purpose subagent with this prompt:
   "Read the file <filepath> and provide a 1-2 sentence summary of its content. Focus on the main topic and key points."

4. Collect all summaries from the subagents

5. Present the results to the user in this format:

   ```
   Found N potentially relevant note(s):

   ### filename1.md
   Summary from analysis

   ### filename2.md
   Summary from analysis
   ```

6. If no relevant notes are found, inform the user

IMPORTANT:
- Use subagents to read and summarize files to keep main context clean
- Only include files that seem genuinely relevant to the query
- Keep summaries concise (1-2 sentences maximum)
- Format filenames as ### markdown headings for easy scanning
