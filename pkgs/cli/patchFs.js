// patchFs.js - Bootstrap file for E2E tests
// This file is used to patch the fs module before the CLI code is loaded

import { Volume, createFsFromVolume } from 'memfs'
import { Union } from 'unionfs'
import { patchFs } from 'fs-monkey'
import * as realFs from 'node:fs'

// Create memfs volume and fs implementation
const vol = new Volume()
const memfs = createFsFromVolume(vol)

// Set up in-memory file system that falls back to real FS for node_modules
const union = new Union()
union.use(memfs).use(realFs)
patchFs(union)

// Export memfs volume for tests to modify
export { vol }