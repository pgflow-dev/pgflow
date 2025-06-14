## Character Usage Guidelines

**IMPORTANT**: Never use the following characters in documentation or code comments. Always use the alternatives listed below:

- **Em-dash (—)**: Use hyphen (-) instead
- **Curly quotes ("" '')**: Use straight quotes ("" '') instead
- **Right single quote/curly apostrophe (')**: Use straight apostrophe (') instead
- **Ellipsis character (…)**: Use three periods (...) instead
- **Non-breaking space**: Use regular space instead

This ensures compatibility across different editors and environments.

### Quick Fix Command

To replace all these characters in a file, use this script:

```bash
./scripts/replace-special-chars.sh <file_path>
```