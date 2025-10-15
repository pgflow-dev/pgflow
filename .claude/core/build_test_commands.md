## Build/Test Commands

- `pnpm nx build <package>` - Build a specific package
- `pnpm nx test <package>` - Run tests for a specific package
- `pnpm nx test:pgtap <package>` - Run PostgreSQL tap tests
- `pnpm nx test:pgtap:watch <package>` - Run PostgreSQL tap tests in watch mode
- `pnpm nx test:vitest <package>` - Run vitest unit tests
- `pnpm nx test:types <package>` - Run types tests (both strict and vitest)
- `pnpm nx test:types:vitest <package>` - Run vitest types tests
- `pnpm nx test:types:strict <package>` - Run strict types tests
- `pnpm nx lint <package>` - Run linting
- `pnpm nx fix-sql <package>` - Fix SQL formatting issues (mostly core package only)
