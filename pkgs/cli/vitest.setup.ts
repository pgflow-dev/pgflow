import { Volume, createFsFromVolume } from 'memfs'
import { Union } from 'unionfs'
import { patchFs } from 'fs-monkey'
import * as realFs from 'node:fs'

// Create memfs volume and fs implementation
export const vol = new Volume()
export const memfs = createFsFromVolume(vol)

// 1️⃣ overlay: everything first hits memfs, then falls back to real
const union = new Union()
union.use(memfs).use(realFs)
patchFs(union)            // Overrides fs operations everywhere

// 2️⃣ always mock interactive prompts
vi.mock('@clack/prompts', () => {
  return {
    intro: vi.fn(),
    log: { info: vi.fn(), step: vi.fn(), success: vi.fn(), error: vi.fn() },
    note: vi.fn(),
    confirm: vi.fn(async () => true),
    text: vi.fn(async ({ placeholder }) => placeholder ?? 'supabase')
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

// Reset memfs volume before each test
beforeEach(() => {
  vol.reset()
})