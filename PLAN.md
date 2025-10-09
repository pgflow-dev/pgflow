# Documentation Reorganization Execution Plan

Based on `guide.md` - reorganize documentation with physical folder structure matching sidebar organization.

## Phase 1: Directory Renames & File Moves (using git mv)

### Step 1.1: Create new directory structure

```bash
# Create all subdirectories
mkdir -p pkgs/website/src/content/docs/develop/{authoring,config-tuning,manage}
mkdir -p pkgs/website/src/content/docs/operate/{deploy,observe,maintain}
mkdir -p pkgs/website/src/content/docs/concepts/{overview,dsl}
mkdir -p pkgs/website/src/content/docs/reference/{configuration,apis,queue-worker}
```

### Step 1.2: Move files with git mv

#### Develop section (from build/)

```bash
git mv pkgs/website/src/content/docs/build/organize-flow-code.mdx pkgs/website/src/content/docs/develop/authoring/organize-flow-code.mdx
git mv pkgs/website/src/content/docs/build/create-reusable-tasks.mdx pkgs/website/src/content/docs/develop/authoring/create-reusable-tasks.mdx
git mv pkgs/website/src/content/docs/build/batch-process-with-map.mdx pkgs/website/src/content/docs/develop/authoring/batch-process-with-map.mdx
git mv pkgs/website/src/content/docs/build/update-flow-options.mdx pkgs/website/src/content/docs/develop/config-tuning/update-flow-options.mdx
git mv pkgs/website/src/content/docs/build/version-flows.mdx pkgs/website/src/content/docs/develop/manage/version-flows.mdx
git mv pkgs/website/src/content/docs/build/delete-flows.mdx pkgs/website/src/content/docs/develop/manage/delete-flows.mdx
```

#### Operate section

```bash
# Deploy
git mv pkgs/website/src/content/docs/production/supabase/deploy.mdx pkgs/website/src/content/docs/operate/deploy/deploy-to-supabase.mdx
git mv pkgs/website/src/content/docs/production/supabase/keep-workers-running.mdx pkgs/website/src/content/docs/operate/deploy/keep-workers-running.mdx

# Observe
git mv pkgs/website/src/content/docs/build/monitor-execution.mdx pkgs/website/src/content/docs/operate/observe/monitor-execution.mdx
git mv pkgs/website/src/content/docs/edge-worker/getting-started/observability.mdx pkgs/website/src/content/docs/operate/observe/monitor-workers-health.mdx

# Maintain
git mv pkgs/website/src/content/docs/production/update-pgflow.mdx pkgs/website/src/content/docs/operate/maintain/update-pgflow.mdx
git mv pkgs/website/src/content/docs/production/prune-records.mdx pkgs/website/src/content/docs/operate/maintain/prune-records.mdx
git mv pkgs/website/src/content/docs/production/connection-string.mdx pkgs/website/src/content/docs/operate/maintain/connection-string.mdx
```

#### Concepts section

```bash
# Overview
git mv pkgs/website/src/content/docs/concepts/index.mdx pkgs/website/src/content/docs/concepts/overview/index.mdx
git mv pkgs/website/src/content/docs/concepts/how-pgflow-works.mdx pkgs/website/src/content/docs/concepts/overview/how-pgflow-works.mdx

# DSL
git mv pkgs/website/src/content/docs/concepts/flow-dsl.mdx pkgs/website/src/content/docs/concepts/dsl/flow-dsl.mdx
git mv pkgs/website/src/content/docs/concepts/map-steps.mdx pkgs/website/src/content/docs/concepts/dsl/map-steps.mdx
git mv pkgs/website/src/content/docs/concepts/context.mdx pkgs/website/src/content/docs/concepts/dsl/context.mdx
git mv pkgs/website/src/content/docs/build/naming-steps.mdx pkgs/website/src/content/docs/concepts/dsl/naming-steps.mdx
```

#### Reference section

```bash
# Configuration
git mv pkgs/website/src/content/docs/get-started/configuration.mdx pkgs/website/src/content/docs/reference/configuration/configuration.mdx

# APIs
git mv pkgs/website/src/content/docs/build/compile-manually.mdx pkgs/website/src/content/docs/reference/apis/compile-api.mdx
git mv pkgs/website/src/content/docs/advanced/manual-installation.mdx pkgs/website/src/content/docs/reference/apis/manual-installation.mdx

# Queue Worker
git mv pkgs/website/src/content/docs/edge-worker/getting-started/configuration.mdx pkgs/website/src/content/docs/reference/queue-worker/configuration.mdx
git mv pkgs/website/src/content/docs/edge-worker/how-it-works.mdx pkgs/website/src/content/docs/reference/queue-worker/how-it-works.mdx
```

#### Comparisons

```bash
# Rename vs/ to comparisons/
git mv pkgs/website/src/content/docs/vs pkgs/website/src/content/docs/comparisons
```

### Step 1.3: Clean up empty directories

After moving files, these should be empty:
- `build/` - delete
- `production/supabase/` and `production/` - delete
- `advanced/` - delete
- `edge-worker/getting-started/` and `edge-worker/` (keep `_drafts` if needed) - delete

---

## Phase 2: Update Page Frontmatter

### reference/apis/compile-api.mdx
Change title from "Manually Compile Flow to SQL" to:
```yaml
title: Compile API
```

### operate/observe/monitor-workers-health.mdx
Change title to:
```yaml
title: Monitor workers health
```

---

## Phase 3: Content Updates

### 3.1 get-started/index.mdx
Add two cards at top of page (after frontmatter, before existing content):
- **Card 1**: "Create your first flow" → `/get-started/flows/create-flow/`
- **Card 2**: "…or run simple jobs" → `/get-started/background-jobs/create-worker/` (marked as optional/smaller)

### 3.2 get-started/flows/run-flow.mdx
Add "Where next?" section at end with three cards:
1. **Ship to Supabase** → `/operate/deploy/deploy-to-supabase/`
2. **Make flows resilient (retries & timeouts)** → `/reference/configuration/configuration/#flow-options`
3. **Observe runs with SQL** → `/operate/observe/monitor-execution/`

### 3.3 reference/configuration/configuration.mdx
Add anchor IDs to sections:
- `#flow-options` - for Flow/Step configuration section
- `#edge-worker-options` - for EdgeWorker configuration section
- `#queue-deltas` - add small note section listing 2-3 differences between flow mode and queue mode

### 3.4 Homepage (index.mdx)
Update CTAs:
- **Primary**: "Create Your First Workflow" (already correct, keep pointing to `/get-started/installation/`)
- **Secondary**: Update to point to background jobs option (add anchor `#background-jobs` reference or adjust target)

---

## Phase 4: Update Sidebar Configuration (astro.config.mjs)

### 4.1 Rename topic labels
- "Build" → "Develop"
- "Production" → "Operate"
- "Configuration" → "Reference" (in plugin config)
- "vs" → "Comparisons"

### 4.2 Restructure sidebar with subgroups

**Get Started/** (no changes to structure, already correct)

**Develop/** (with subgroups)
```javascript
{
  label: 'Develop',
  icon: 'puzzle',
  items: [
    {
      label: 'Authoring',
      items: [
        { autogenerate: { directory: 'develop/authoring/' } }
      ]
    },
    {
      label: 'Config & Tuning',
      items: [
        { autogenerate: { directory: 'develop/config-tuning/' } }
      ]
    },
    {
      label: 'Manage',
      items: [
        { autogenerate: { directory: 'develop/manage/' } }
      ]
    }
  ]
}
```

**Operate/** (with subgroups)
```javascript
{
  label: 'Operate',
  icon: 'setting',
  items: [
    {
      label: 'Deploy',
      items: [
        { autogenerate: { directory: 'operate/deploy/' } }
      ]
    },
    {
      label: 'Observe',
      items: [
        { autogenerate: { directory: 'operate/observe/' } }
      ]
    },
    {
      label: 'Maintain',
      items: [
        { autogenerate: { directory: 'operate/maintain/' } }
      ]
    }
  ]
}
```

**Concepts/** (with subgroups)
```javascript
{
  label: 'Concepts',
  icon: 'information',
  items: [
    {
      label: 'Overview',
      items: [
        { autogenerate: { directory: 'concepts/overview/' } }
      ]
    },
    {
      label: 'DSL',
      items: [
        { autogenerate: { directory: 'concepts/dsl/' } }
      ]
    }
  ]
}
```

**Reference/** (with subgroups)
```javascript
{
  label: 'Reference',
  icon: 'document',
  items: [
    {
      label: 'Configuration',
      items: [
        { autogenerate: { directory: 'reference/configuration/' } }
      ]
    },
    {
      label: 'APIs',
      items: [
        { autogenerate: { directory: 'reference/apis/' } }
      ]
    },
    {
      label: 'Queue Worker',
      items: [
        { autogenerate: { directory: 'reference/queue-worker/' } }
      ]
    }
  ]
}
```

**Tutorials/** (no changes)

**Comparisons/** (rename from vs)
```javascript
{
  label: 'Comparisons',
  icon: 'puzzle',
  items: [
    { autogenerate: { directory: 'comparisons/' } }
  ]
}
```

---

## Phase 5: Add Redirects (astro.config.mjs)

Add redirects for all moved files (~30 redirects):

```javascript
redirects: {
  // Existing redirects...

  // Develop (from build/)
  '/build/organize-flow-code/': '/develop/authoring/organize-flow-code/',
  '/build/create-reusable-tasks/': '/develop/authoring/create-reusable-tasks/',
  '/build/batch-process-with-map/': '/develop/authoring/batch-process-with-map/',
  '/build/update-flow-options/': '/develop/config-tuning/update-flow-options/',
  '/build/version-flows/': '/develop/manage/version-flows/',
  '/build/delete-flows/': '/develop/manage/delete-flows/',
  '/build/naming-steps/': '/concepts/dsl/naming-steps/',
  '/build/monitor-execution/': '/operate/observe/monitor-execution/',
  '/build/compile-manually/': '/reference/apis/compile-api/',

  // Operate (from production/)
  '/production/supabase/deploy/': '/operate/deploy/deploy-to-supabase/',
  '/production/supabase/keep-workers-running/': '/operate/deploy/keep-workers-running/',
  '/production/update-pgflow/': '/operate/maintain/update-pgflow/',
  '/production/prune-records/': '/operate/maintain/prune-records/',
  '/production/connection-string/': '/operate/maintain/connection-string/',

  // Reference
  '/get-started/configuration/': '/reference/configuration/configuration/',
  '/advanced/manual-installation/': '/reference/apis/manual-installation/',

  // Edge Worker to Reference
  '/edge-worker/getting-started/configuration/': '/reference/queue-worker/configuration/',
  '/edge-worker/getting-started/observability/': '/operate/observe/monitor-workers-health/',
  '/edge-worker/how-it-works/': '/reference/queue-worker/how-it-works/',

  // Concepts
  '/concepts/': '/concepts/overview/',
  '/concepts/flow-dsl/': '/concepts/dsl/flow-dsl/',
  '/concepts/map-steps/': '/concepts/dsl/map-steps/',
  '/concepts/context/': '/concepts/dsl/context/',

  // Comparisons
  '/vs/': '/comparisons/',
  '/vs/dbos/': '/comparisons/dbos/',
  '/vs/inngest/': '/comparisons/inngest/',
  '/vs/trigger/': '/comparisons/trigger/',
}
```

---

## Phase 6: Fix Links & Build

### 6.1 Run build
```bash
pnpm nx build website
```

### 6.2 Identify broken links
Look for link validation errors in build output

### 6.3 Fix links systematically
Use sed or manual edits to update internal links to new paths

### 6.4 Verify build passes
```bash
pnpm nx build website
```

---

## Expected Outcomes

After completion:
- ✅ URL structure matches sidebar organization
- ✅ All old URLs redirect to new locations
- ✅ "Develop" and "Operate" replace "Build" and "Production"
- ✅ Reference section contains configuration and API docs
- ✅ Queue worker docs are in Reference section
- ✅ Concepts organized into Overview and DSL subgroups
- ✅ Get Started shows clear choice between flows and background jobs
- ✅ All links work and build passes

---

## Execution Order

1. **Phase 1**: File moves (safest, preserves git history)
2. **Phase 2**: Frontmatter updates (simple, low risk)
3. **Phase 3**: Content updates (adds navigation aids)
4. **Phase 4**: Sidebar configuration (changes navigation structure)
5. **Phase 5**: Redirects (ensures old URLs work)
6. **Phase 6**: Fix any resulting link issues

Each phase can be committed separately for easy rollback if needed.
