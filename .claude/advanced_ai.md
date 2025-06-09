## Advanced AI Consultation

When stuck on complex technical issues, you can consult AI models using the provided wrapper scripts:

### Default AI Consultation

For most questions, use the default AI model:

```bash
scripts/ask-ai -f <file1> -f <file2> -f <fileX> "your detailed query"
```

### Ultra AI Consultation

For **ULTRA HARD** technical issues when you're struggling or going in circles, use the more powerful model:

```bash
scripts/ask-ultra-ai -f <file1> -f <file2> -f <fileX> "your detailed query"
```

### Session Management

To maintain context across multiple queries, use sessions:

```bash
scripts/ask-ai --session <session-name> --save-session "your question"
scripts/ask-ai --session <session-name> --save-session "follow-up question"
```

### Usage Guidelines

- **Default approach**: Use `scripts/ask-ai` for standard technical questions
- **Escalation**: Use `scripts/ask-ultra-ai` only when:
  - You've tried the default AI and still need help
  - You're explicitly prompted to use it
  - You're stuck in circular reasoning and need breakthrough insights
  - Dealing with extremely complex multi-layered technical problems

**IMPORTANT**: File paths must be relative to your current working directory. Use relative paths like `../core/file.sql` not absolute paths when referencing files outside the current directory.
