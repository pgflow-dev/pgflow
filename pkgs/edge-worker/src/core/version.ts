// Baked in at build time from this package's package.json (relative JSON
// import, inlined by the bundler — never a runtime file read). Published dist
// therefore always carries the released version.
// The `with { type: 'json' }` attribute is required: Deno (the JSR runtime)
// rejects attribute-less JSON imports.
import pkg from '../../package.json' with { type: 'json' };

export const pgflowVersion: string = pkg.version;
