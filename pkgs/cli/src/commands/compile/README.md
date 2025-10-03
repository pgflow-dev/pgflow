# pgflow compile

The `pgflow compile` command compiles a TypeScript-defined flow into SQL migration files that can be used to deploy flows into pgflow's SQL orchestration layer.

## Usage

```bash
pgflow compile path/to/flow.ts --deno-json=path/to/deno.json
```

## Arguments

- `path/to/flow.ts`: Path to the TypeScript file containing the flow definition. The file must have a default export of a pgflow Flow object.

## Options

- `--deno-json=path/to/deno.json`: (Required) Path to the deno.json configuration file that includes the pgflow DSL package in its imports.

## Example

```bash
# Compile a flow and generate a migration file
pgflow compile src/flows/analyze-website.ts --deno-json=deno.json

# The command will create a migration file in the ./migrations directory
# with a name like pgflow_2025-04-19T13_45_30_123Z.sql
```

## Requirements

- Deno must be installed on your system
- The flow file must have a default export
- The deno.json file must include the pgflow DSL package in its imports

## Example deno.json

```json
{
  "imports": {
    "@pgflow/dsl": "npm:@pgflow/dsl"
  }
}
```

## How it works

1. The command resolves the paths to the flow file and deno.json
2. It creates a migrations directory if it doesn't exist
3. It runs a Deno subprocess to compile the flow into SQL statements
4. The SQL statements are written to a migration file in the migrations directory

## Notes

- The migration files are append-only; the command doesn't handle flow deletion or migration rollback
- One flow per file is supported (the default export)
- The command doesn't implement watch mode or batching
