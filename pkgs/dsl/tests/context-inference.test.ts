import { Flow, Context, ExtractFlowContext } from '../src/dsl.js';

// Type definitions for testing
interface TestSql {
  query: (sql: string) => Promise<any>;
}

interface TestRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

interface TestSupabase {
  from: (table: string) => any;
}

// Test 1: Minimal context flow (just env + shutdownSignal)
const MinimalFlow = new Flow({ slug: 'minimal-flow' })
  .step({ slug: 'process' }, async (input, context) => {
    // Context should only have env and shutdownSignal
    const envValue: string | undefined = context.env.NODE_ENV;
    const signal: AbortSignal = context.shutdownSignal;
    
    // TypeScript should error if we try to access sql
    // @ts-expect-error - sql doesn't exist on minimal context
    const sql = context.sql;
    
    return { processed: true };
  });

// Verify the extracted context type is empty object
type MinimalFlowContext = ExtractFlowContext<typeof MinimalFlow>;
const _minimalContextTest: MinimalFlowContext = {}; // Should compile

// Test 2: Inferred context from single handler
const SingleInferredFlow = new Flow({ slug: 'single-inferred' })
  .step({ slug: 'query' }, async (input, context: Context & { sql: TestSql }) => {
    // Handler declares it needs sql
    const result = await context.sql.query('SELECT 1');
    return { result };
  });

// Verify the extracted context has sql
type SingleInferredContext = ExtractFlowContext<typeof SingleInferredFlow>;
const _singleInferredTest: SingleInferredContext = { sql: {} as TestSql }; // Should compile

// Test 3: Multiple steps with different context requirements
const MultiInferredFlow = new Flow({ slug: 'multi-inferred' })
  .step({ slug: 'query' }, async (input, context: Context & { sql: TestSql }) => {
    const users = await context.sql.query('SELECT * FROM users');
    return { users };
  })
  .step({ slug: 'cache' }, async (input, context: Context & { redis: TestRedis }) => {
    await context.redis.set('users', JSON.stringify(input.query.users));
    return { cached: true };
  })
  .step({ slug: 'notify' }, async (input, context: Context & { sql: TestSql, supabase: TestSupabase }) => {
    // This step needs both sql AND supabase
    await context.sql.query('INSERT INTO logs...');
    await context.supabase.from('notifications').insert({});
    return { notified: true };
  });

// Verify the extracted context has all accumulated requirements
type MultiInferredContext = ExtractFlowContext<typeof MultiInferredFlow>;
const _multiInferredTest: MultiInferredContext = {
  sql: {} as TestSql,
  redis: {} as TestRedis,
  supabase: {} as TestSupabase
}; // Should compile

// Test 4: Explicit context type parameter
interface ExplicitContext {
  sql: TestSql;
  cache: TestRedis;
  pubsub: { publish: (event: string) => void };
}

const ExplicitFlow = new Flow<{ userId: string }, ExplicitContext>({ slug: 'explicit-flow' })
  .step({ slug: 'get-user' }, async (input, context) => {
    // All ExplicitContext properties should be available
    const user = await context.sql.query(`SELECT * FROM users WHERE id = ${input.run.userId}`);
    await context.cache.set(`user:${input.run.userId}`, JSON.stringify(user));
    context.pubsub.publish('user-fetched');
    return user;
  });

// Verify the extracted context matches explicit type
type ExplicitFlowContext = ExtractFlowContext<typeof ExplicitFlow>;
const _explicitTest: ExplicitFlowContext = {
  sql: {} as TestSql,
  cache: {} as TestRedis,
  pubsub: { publish: () => {} }
}; // Should compile

// Test 5: Mixed approach - explicit base with inferred additions
const MixedFlow = new Flow<{ id: string }, { sql: TestSql }>({ slug: 'mixed-flow' })
  .step({ slug: 'query' }, async (input, context) => {
    // Has sql from explicit type
    return await context.sql.query(`SELECT * FROM items WHERE id = ${input.run.id}`);
  })
  .step({ slug: 'enhance' }, async (input, context: Context & { sql: TestSql, ai: { generate: () => string } }) => {
    // Adds ai requirement via inference
    const enhanced = context.ai.generate();
    return { enhanced };
  });

// Verify context has both explicit and inferred requirements
type MixedFlowContext = ExtractFlowContext<typeof MixedFlow>;
const _mixedTest: MixedFlowContext = {
  sql: {} as TestSql,
  ai: { generate: () => 'test' }
}; // Should compile

// Test 6: Handler using only partial context
const PartialContextFlow = new Flow({ slug: 'partial-context' })
  .step({ slug: 'process' }, async (input, context: { customField: string }) => {
    // Handler doesn't use Context base type, just its own requirements
    return { processed: context.customField };
  });

// Verify the extracted context has the custom field
type PartialContextFlowContext = ExtractFlowContext<typeof PartialContextFlow>;
const _partialTest: PartialContextFlowContext = { customField: 'test' }; // Should compile

// Type-level tests to ensure inference works correctly
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

// These should all be true
type Test1 = AssertEqual<ExtractFlowContext<typeof MinimalFlow>, {}>;
type Test2 = AssertEqual<ExtractFlowContext<typeof SingleInferredFlow>, { sql: TestSql }>;
type Test3 = AssertEqual<
  ExtractFlowContext<typeof MultiInferredFlow>,
  { sql: TestSql; redis: TestRedis; supabase: TestSupabase }
>;
type Test4 = AssertEqual<ExtractFlowContext<typeof ExplicitFlow>, ExplicitContext>;
type Test5 = AssertEqual<
  ExtractFlowContext<typeof MixedFlow>,
  { sql: TestSql; ai: { generate: () => string } }
>;

console.log('Context inference type tests completed successfully!');