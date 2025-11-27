# Create D2 Diagram with Theme Import

You are helping create D2 diagrams in the pgflow documentation that use the shared pgflow theme.

## Quick Reference

### Basic D2 Code Block with Import

````markdown
```d2
...@../../assets/pgflow-theme.d2

direction: right

nodeA: "Node A"
nodeB: "Node B"
nodeA -> nodeB
```
````

**CRITICAL**: There MUST be a blank line after the code fence and before the import line!

## Theme File Location

The shared theme is at: `pkgs/website/src/assets/pgflow-theme.d2`

## Path Resolution

From content files, use relative path: `...@../../assets/pgflow-theme.d2`

- From `src/content/docs/*.mdx` → `../../assets/pgflow-theme.d2`
- From `src/content/docs/subdir/*.mdx` → `../../../assets/pgflow-theme.d2`

## How It Works

1. The `...@path` syntax tells D2 to import and merge the theme configuration
2. The astro-d2 plugin processes this during build
3. D2 resolves the relative path from the markdown file's location
4. The theme vars are merged with your diagram code

## Common Patterns

### Simple Workflow
````markdown
```d2
...@../../assets/pgflow-theme.d2

direction: right
start -> process -> end
```
````

### With Custom Styling
````markdown
```d2
...@../../assets/pgflow-theme.d2

direction: down

start: "Start" {
  style: {
    fill: "#003b34"
    stroke: "#00574d"
    font-color: "#a3d4cb"
  }
}
```
````

## Troubleshooting

**Diagram shows code instead of rendering?**
- Ensure blank line after ` ```d2 `
- Check relative path is correct from file location

**Import not found?**
- Verify theme file exists at `src/assets/pgflow-theme.d2`
- Count directory levels correctly (`../` for each parent)
