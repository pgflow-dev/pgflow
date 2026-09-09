#!/usr/bin/env node
// Checks Nx's own fresh workspace file map. Git tracking does not determine
// cache visibility: nonignored untracked files count, and .nxignore can
// reinclude a Git-ignored path.
const path = require('node:path');

const [root, file] = process.argv.slice(2);
if (!root || !file || path.isAbsolute(file) || file.startsWith('../')) {
  process.exit(2);
}

process.env.NX_DAEMON = 'false';
const { getAllFileDataInContext } = require('nx/src/utils/workspace-context');

getAllFileDataInContext(root)
  .then((files) => process.exit(files.some((entry) => entry.file === file) ? 0 : 1))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
