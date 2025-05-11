# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CLI Command Design Patterns ⚠️

### Output Philosophy

When designing CLI commands for pgflow, follow these principles:

1. **Minimize Output**: Only show information that is directly valuable to the user.

   - Avoid redundant or duplicate messages
   - Keep feedback concise and informative
   - No spinners or excessive progress indicators

2. **Log Levels**: Use the appropriate log level for different types of messages:

   - `log.success`: Final success messages, positive outcomes, or when a check passes
   - `log.info`: Neutral information that may be valuable to the user
   - `log.warn`: When something is skipped or might need attention
   - `log.error`: When something has failed

3. **User Confirmations**:
   - Use `note()` to show detailed information before asking for confirmation
   - Use `confirm()` for yes/no decisions
   - Support an `autoConfirm` flag to allow non-interactive usage

### Command Structure

Commands should follow this pattern:

1. Check state/resources without user interaction
2. If no changes needed, print a success message and exit cleanly
3. For changes:
   - Show what will be changed (using `note()` with color coding if helpful)
   - Get confirmation from user (unless auto-confirmed)
   - Make changes and report success/error
   - Avoid spinners and progress indicators

### Installation Command Flow

Installation commands should follow this sequence:

1. **Check status**: Verify what needs to be done without using spinners
2. **Early exit**: If nothing needs to be done, report success and exit
3. **Summarize changes**: Present a clear list of what will be changed
4. **Get confirmation**: Ask for user approval (skip if auto-confirmed)
5. **Apply changes**: Make the changes directly without progress indicators
6. **Report outcome**: Confirm success or report failure with clear error messages

This pattern ensures commands are:

- Clear and informative
- Respectful of users' time and attention
- Functional in both interactive and non-interactive contexts
- Consistent in style and behavior across the CLI

## CLI Component Reference

When implementing new CLI commands, refer to [CLACK_API.md](./CLACK_API.md) for the complete API documentation of @clack/prompts. This reference should be consulted when:

1. Creating new interactive commands
2. Working with user input components (text, select, confirm, etc.)
3. Implementing consistent logging patterns
4. Building multi-step command flows using groups

Always prioritize the design patterns outlined above while implementing the technical details from the API reference.
