# Local Development Setup

This document contains setup instructions specific to local development environments.

> **Note**: This is a starting point and will be expanded with more comprehensive setup instructions in the future.

## Claude Symlink Hook

Claude Code skills and configuration are stored in a separate private repository (`pgflow-dev/claude`). If you have access to this repository and need the `.claude/` directory to be symlinked on branch changes, configure the following:

1. Add to your `.envrc.local`:
   ```bash
   export CLAUDE_SYMLINK_SCRIPT="/path/to/your/claude/symlink.sh"
   ```

2. Run `direnv allow` to reload the environment

The `post-checkout` hook in `lefthook.yml` will automatically run this script whenever you switch branches.
