# Troubleshooting

## Scripts can't find $notes

**Error:** `Error: $notes environment variable not set`

**Fix:**
```bash
# Check if set
echo $notes

# Set temporarily
export notes="/path/to/notes"

# Set permanently (add to ~/.bashrc or ~/.zshrc)
echo 'export notes="/path/to/notes"' >> ~/.bashrc
```

## Scripts not executable

**Error:** `Permission denied`

**Fix:**
```bash
chmod +x .claude/skills/roadmap/scripts/*
```

## No search results

**Possible causes:**
- Pattern doesn't match any files
- Typo in pattern or path
- Files don't exist

**Try:**
- Broader pattern: `"feature"` instead of `"feature-x-implementation"`
- Check directory: `ls "$notes/roadmaps/"`
- Verify pattern syntax (regex)

## Git errors

**Error:** `fatal: not a git repository`

**Fix:**
```bash
cd "$notes"
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
