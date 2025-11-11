# Phase 0: Foundation

**Branch:** `feat-demo-0-foundation`

**Goal:** Create fresh SvelteKit app, integrate with Nx and pnpm workspace, verify it builds successfully.

**Success Criteria:**
- ✅ `apps/demo/` exists with SvelteKit app
- ✅ `pnpm nx build demo` completes successfully
- ✅ `pnpm nx dev demo` starts dev server
- ✅ Dependencies installed via pnpm workspace
- ✅ Cloudflare adapter configured
- ✅ No build errors or warnings

---

## Tasks

### 1. Create Fresh SvelteKit App

```bash
pnpm create svelte@latest apps/demo --template skeleton --types typescript
```
Select: TypeScript ✓, ESLint ✓, Prettier ✓, Skip testing tools

### 2. Configure Nx Integration

Create `apps/demo/project.json` with standard Nx configuration:
- Define targets: `dev`, `build`, `preview`
- Set executor to `nx:run-commands` for each
- Point commands to Vite (e.g., `vite dev`, `vite build`)
- Add build output path: `{projectRoot}/build`

### 3. Add Core Dependencies

```bash
cd apps/demo

# Add Cloudflare adapter for deployment
pnpm add -D @sveltejs/adapter-cloudflare

# Add Tailwind CSS for styling (automated setup)
npx svelte-add@latest tailwindcss

# Add Supabase for backend
pnpm add @supabase/supabase-js

# Install all dependencies
pnpm install
```

### 4. Update Package Configuration

Edit `apps/demo/package.json` to set the package name:
- Change `"name"` to `"@pgflow/demo"`
- Add `"private": true`

**Note:** `@pgflow/client`, `@xyflow/svelte`, and `shiki` will be added in later phases as needed.

### 5. Configure Cloudflare Adapter

Update `apps/demo/svelte.config.js`:
- Import `@sveltejs/adapter-cloudflare` instead of adapter-auto
- Set in config: `kit: { adapter: adapter() }`

### 6. Test Build

```bash
# From monorepo root
pnpm nx build demo

# Verify build output exists
ls apps/demo/build
```

### 7. Test Dev Server

```bash
# From monorepo root
pnpm nx dev demo

# Open http://localhost:5173/
# Verify page loads without console errors
```

---

## Validation Checklist

- [ ] `apps/demo/` exists with `project.json`
- [ ] `package.json` name is `@pgflow/demo`
- [ ] Cloudflare adapter configured in `svelte.config.js`
- [ ] Tailwind CSS working (check for `app.css` with `@tailwind` directives)
- [ ] `pnpm nx build demo` succeeds, creates `apps/demo/build/`
- [ ] `pnpm nx dev demo` starts, http://localhost:5173/ loads
- [ ] No TypeScript or console errors

---

## Troubleshooting

- **`pnpm create svelte` fails:** Check Node.js version (≥18), network connection
- **`svelte-add tailwindcss` fails:** Run manually: `pnpm add -D tailwindcss postcss autoprefixer`
- **Nx doesn't recognize demo:** Verify `apps/demo/project.json` exists, run `pnpm nx show projects`
- **Build fails:** Check Cloudflare adapter installed: `pnpm list @sveltejs/adapter-cloudflare`
- **Dev server won't start:** Check port 5173 available (`lsof -i :5173`), try `--port 5174`

---

## Next Phase

Proceed to **Phase 1: Vertical Slice** for end-to-end flow execution with minimal UI. Create branch `feat-demo-1-vertical-slice`.
