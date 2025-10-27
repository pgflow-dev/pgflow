# Troubleshooting

## .notes directory not found

**Error:** `ERROR: .notes directory not found at ./.notes`

**Fix:**
```bash
# Create symlink to your notes directory
ln -s /path/to/your/notes-directory .notes

# Example:
ln -s ~/Documents/pgflow-notes .notes
```

## Scripts not executable

**Error:** `Permission denied`

**Fix:**
```bash
chmod +x .claude/skills/notes/scripts/*
```

## No search results

**Possible causes:**
- Pattern doesn't match any files
- Typo in pattern or path
- Files don't exist

**Try:**
- Broader pattern: `"feature"` instead of `"feature-x-implementation"`
- Check directory: `ls ./.notes/`
- Verify pattern syntax (regex)

## Git errors

**Error:** `fatal: not a git repository`

**Fix:**
```bash
cd ./.notes
git init
git add .
git commit -m "Initial commit"
```

## Missing H1 titles

**Issue:** Script shows filename instead of title

**Not an error** - scripts fall back to filename if H1 missing

**Add H1 for better organization:**
```markdown
# Title Goes Here

[rest of content...]
```
