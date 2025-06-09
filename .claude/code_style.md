## Code Style Guidelines

- **TypeScript**: Use strict mode with proper type annotations
- **Database**: PgFlow uses PostgreSQL for workflow orchestration
- **Imports**: Use package paths where defined (e.g., `@pgflow/core`, `@pgflow/dsl`)
- **Formatting**: Follow existing code style with proper indentation
- **Testing**: Write tests for both PostgreSQL functions (PgTAP) and TypeScript (Vitest)
- **Naming**: Use camelCase for variables/functions, PascalCase for classes/types
- **Error Handling**: Use proper error types and handle errors appropriately
- **File Structure**: Monorepo structure with packages in pkgs/ directory
- **Documentation Style**: Use impersonal, factual language. Avoid "we" and "our" when describing technical concepts, flows, or processes. Only use "you" when directly instructing the reader. Focus on what the system does, not who is doing it.
