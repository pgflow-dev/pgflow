import { Flow as SupabaseFlow } from '@pgflow/dsl/supabase';
import { EdgeWorker } from '../../src/EdgeWorker.js';
import type { Json } from '@pgflow/dsl';

// Example 1: Flow using only platform resources - should work
const validFlow = new SupabaseFlow({ slug: 'valid_flow' })
  .step({ slug: 'query' }, async (_input, ctx) => {
    // Platform resources (sql, supabase) are available automatically
    const result = await ctx.sql`SELECT * FROM users`;
    return { users: result };
  })
  .step({ slug: 'notify' }, (_input, ctx) => {
    // Supabase client is available
    void ctx.supabase;
    return { notified: true };
  });

// This compiles without errors - flow is compatible with platform
EdgeWorker.start(validFlow);

// Example 2: Flow requiring custom resources - should fail type check
interface RedisClient {
  get: (key: string) => Promise<string | null>;
}

interface FinalizeContextOutput {
  sessionId: string;
  sonioxTranscriptionId: string;
  isTerminal: boolean;
}

interface ArrayItemDto {
  id: string;
  status: 'queued' | 'done';
}

interface MappedItemDto {
  id: string;
  statusLabel: string;
}

const invalidFlow = new SupabaseFlow<Json, { redis: RedisClient }>({
  slug: 'invalid_flow',
}).step({ slug: 'cache' }, (_input, ctx) => {
  // redis is available in handler due to type parameter
  void ctx.redis;
  return { cached: true };
});

// This should cause a TypeScript error - platform doesn't provide redis
// @ts-expect-error - Platform doesn't provide redis
EdgeWorker.start(invalidFlow);

// Example 3: Flow using only base context (no platform resources) - should work
const baseContextFlow = new SupabaseFlow({ slug: 'base_context_flow' }).step(
  { slug: 'check_env' },
  (_input, ctx) => {
    // Only using base context properties (env, shutdownSignal)
    const apiKey = ctx.env.API_KEY;
    void ctx.shutdownSignal;
    return { hasApiKey: !!apiKey };
  }
);

// This compiles without errors - base context is always available
EdgeWorker.start(baseContextFlow);

// Example 4: Flow using mixed platform resources across steps - should work
const mixedResourcesFlow = new SupabaseFlow({ slug: 'mixed_resources_flow' })
  .step({ slug: 'query_db' }, async (_input, ctx) => {
    // Uses sql in this step
    const result = await ctx.sql`SELECT id FROM users LIMIT 1`;
    return { userId: result[0]?.id as string };
  })
  .step({ slug: 'call_api', dependsOn: ['query_db'] }, async (input, ctx) => {
    // Uses supabase client in this step
    const { data } = await ctx.supabase
      .from('profiles')
      .select('*')
      .eq('user_id', input.query_db.userId);
    return { profile: data };
  });

// This compiles without errors - both sql and supabase are platform resources
EdgeWorker.start(mixedResourcesFlow);

// Example 5: Flow with skippable leaf step should still be start-compatible
const skippableLeafFlow = new SupabaseFlow({ slug: 'skippable_leaf_flow' })
  .step({ slug: 'prepare' }, () => ({ ok: true }))
  .step(
    {
      slug: 'leaf_optional',
      dependsOn: ['prepare'],
      if: { prepare: { ok: false } },
      whenUnmet: 'skip',
    },
    (deps) => ({ status: deps.prepare.ok ? 'ready' : 'blocked' })
  );

// This compiles without errors - skippable leaf outputs are still compatible
EdgeWorker.start(skippableLeafFlow);

// Example 6: Invalid step output should fail at step definition time
const invalidStepOutputFlow = new SupabaseFlow({ slug: 'invalid_step_output' })
  // @ts-expect-error - undefined is not JSON-compatible in step outputs
  .step({ slug: 'bad_step' }, () => ({
    maybe: undefined as string | undefined,
  }));

// If the above expectation ever fails, this call would become type-checked and fail downstream.
// Keep this line as smoke coverage that valid flows are accepted by EdgeWorker.start.
void invalidStepOutputFlow;

// Example 7: Interface DTO step outputs should remain start-compatible
const interfaceDtoFlow = new SupabaseFlow<{ id: string }>({
  slug: 'interface_dto_flow',
})
  .step({ slug: 'finalizeContext' }, () => {
    const result: FinalizeContextOutput = {
      sessionId: 's1',
      sonioxTranscriptionId: 't1',
      isTerminal: false,
    };

    return result;
  })
  .step(
    {
      slug: 'next',
      dependsOn: ['finalizeContext'],
      if: { finalizeContext: { isTerminal: false } },
    },
    (deps) => ({
      transcriptionId: deps.finalizeContext.sonioxTranscriptionId,
    })
  );

// This should compile without errors - interface DTO outputs must not collapse flow compatibility.
EdgeWorker.start(interfaceDtoFlow);

// Example 8: Interface DTO array outputs should remain start-compatible
const interfaceDtoArrayFlow = new SupabaseFlow<{ ids: string[] }>({
  slug: 'interface_dto_array_flow',
})
  .array({ slug: 'items' }, (flowInput) =>
    flowInput.ids.map(
      (id): ArrayItemDto => ({
        id,
        status: 'queued',
      })
    )
  )
  .step({ slug: 'count_done', dependsOn: ['items'] }, (deps) => ({
    done: deps.items.filter((item) => item.status === 'done').length,
  }));

EdgeWorker.start(interfaceDtoArrayFlow);

// Example 9: Interface DTO map outputs should remain start-compatible
const interfaceDtoMapFlow = new SupabaseFlow<{ ids: string[] }>({
  slug: 'interface_dto_map_flow',
})
  .array({ slug: 'items' }, (flowInput) =>
    flowInput.ids.map(
      (id): ArrayItemDto => ({
        id,
        status: 'queued',
      })
    )
  )
  .map(
    { slug: 'item_labels', array: 'items' },
    (item): MappedItemDto => ({
      id: item.id,
      statusLabel: item.status === 'done' ? 'complete' : 'pending',
    })
  )
  .step({ slug: 'first_label', dependsOn: ['item_labels'] }, (deps) => ({
    firstStatus: deps.item_labels[0]?.statusLabel ?? 'none',
  }));

EdgeWorker.start(interfaceDtoMapFlow);
