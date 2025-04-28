# 📋 Implementation Plan – End-to-End testing of the `pgflow` CLI

> Goal: exercise the compiled CLI exactly the way a user would (via `node ./bin` or `npx pgflow …`) **while** preventing any writes to the real disk.  
> Approach: run the CLI inside Vitest, patch the Node APIs that touch the outside world (file-system, child processes, interactive prompts) and then assert on the **in-memory FS**.

---

## 1. Tooling Landscape

| Concern                        | Library / Technique                       | Notes |
| ------------------------------ | ----------------------------------------- | ----- |
| Test runner                    | **Vitest**                                | already used elsewhere |
| In-memory file-system          | **memfs** + `unionfs` (overlay)           | keeps `node_modules` visible but diverts project writes |
| Monkey-patching `require` / `import` | **fs-monkey**                           | replaces `fs` for everything that the CLI itself `imports` |
| Stubbing interactive prompts   | `vi.mock('@clack/prompts')`               | make `confirm()`, `text()` etc. return canned answers |
| Stubbing subprocesses (`spawn`) | `vi.spyOn(child_process, 'spawn')`        | fake Deno, capture the SQL string |
| Running the CLI                | `execa` *or* direct `program.parseAsync`  | either spin a real Node process, or call the commander instance in-process |

---

## 2. Global Test Harness

1. `vitest.setup.ts`
   ```ts
   import { vol, fs as memfs } from 'memfs'
   import { ufs } from 'unionfs'
   import { patchFs } from 'fs-monkey'
   import * as realFs from 'fs'

   // 1️⃣ overlay: everything first hits memfs, then falls back to real
   const union = ufs.use(memfs).use(realFs)
   patchFs(union)            // Overrides `require('fs')` everywhere

   // 2️⃣ always mock interactive prompts
   vi.mock('@clack/prompts', () => {
     return {
       intro: vi.fn(),
       log:   { info: vi.fn(), step: vi.fn(), success: vi.fn(), error: vi.fn() },
       note:  vi.fn(),
       confirm: vi.fn(async () => true),
       text:    vi.fn(async ({ placeholder }) => placeholder ?? 'supabase')
     }
   })

   // 3️⃣ stub child_process.spawn (Deno)
   import * as cp from 'child_process'
   vi.spyOn(cp, 'spawn').mockImplementation(() => {
     const { PassThrough } = require('stream')
     const stdout = new PassThrough()
     const stderr = new PassThrough()
     // Return minimal ChildProcess interface
     return {
       stdout,
       stderr,
       on: (event, cb) => {
         if (event === 'close') {
           stdout.end('/* fake SQL */')
           cb(0)           // exit code 0
         }
       }
     } as any
   })
   ```
2. Ensure this setup file is registered in `vitest.config.ts`:
   ```ts
   export default defineConfig({
     test: {
       setupFiles: ['vitest.setup.ts'],
     }
   })
   ```

---

## 3. Test-Case Cookbook

### 3.1 `install` command

| Scenario | Pre-seeded FS (JSON) | CLI invocation | Expected assertions |
| -------- | ------------------- | -------------- | ------------------- |
| Fresh project → everything installed | `{ '/supabase/config.toml': valid-but-unpatched }` plus fake migrations in `@pgflow/core` side of *real* fs | `await run('install --supabase-path /supabase')` |  • new files exist: `/supabase/migrations/<files>`<br>• config.toml changed (diff)<br>• `/supabase/functions/.env` contains vars |
| Run twice → idempotent | Start with result of previous test | same command |  nothing new copied, function returns 0 changes |

### 3.2 `compile` command

| Scenario | Pre-seeded FS | Invocation | Expected |
| -------- | ------------- | ---------- | -------- |
| Valid TS flow & deno.json | `{ '/flow.ts': dummy file export default {}, '/deno.json': '{"imports":{}}', '/supabase/': {} }` | `compile /flow.ts --deno-json /deno.json --supabase-path /supabase` | • one new file in `/supabase/migrations/` matching regex `^\d+_create_flow_flow.sql$`<br>• file contents equal `"/* fake SQL */"` from stubbed Deno |

*(Additional edge cases: missing paths, existing migrations directory, deno process failure, etc.)*

---

## 4. Helper Utilities

• `createSupabaseSkeleton(vol, options?)` – writes minimal `config.toml`, directory layout  
• `readMemFile(path)` – simple wrapper around `fs.readFileSync` for nicer expect statements  
• `run(args: string)` – small helper that imports `src/index.ts`, calls `program.parseAsync(splitArgs(args))`, and returns captured stdout / stderr.

---

## 5. When to fork a real Node process?

Running the CLI in-process is fast and lets us hook spies easily.  
If we want a *true* E2E smoke test, add one dedicated suite that:

1. Compiles the CLI (or points at `dist/index.js`),  
2. Launches it with `execaNode('dist/index.js', ['install', …], { env, cwd })`,  
3. Uses `memfs` still by preloading with `node --require=./patchFs.js`.

This requires a small bootstrap (`patchFs.js`) that applies the same `fs-monkey` overlay before the CLI code loads.

---

## 6. Open Questions ❓

1. Which parts are critical to cover **first**: only `install`, or `compile` as well?  
2. Should tests verify the **printed output** / colors, or just side-effects on the FS?  
3. Is Deno actually required for unit tests, or is faking the spawn + stdout sufficient?  
4. Do we want a matrix of OS-specific path separators (Windows vs POSIX) using `vitest --environment=node --test-runner=@vitest/runner` etc.?  

Please let me know your preferences so the detailed test specs can be fleshed out accordingly!
