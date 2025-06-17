# Performance Benchmark Scripts

## performance-benchmark.mjs

A high-scale performance test for the pgflow client that measures throughput and performance under load.

### Usage

```bash
# Run with default settings (100 steps, 20 concurrent flows)
pnpm nx run client:benchmark

# Customize via environment variables
STEP_COUNT=200 CONCURRENT_FLOWS=50 pnpm nx run client:benchmark
```

### Environment Variables

- `STEP_COUNT` - Number of steps in high-frequency test (default: 100)
- `CONCURRENT_FLOWS` - Number of concurrent flows to run (default: 20) 
- `STEPS_PER_FLOW` - Steps per flow in concurrent test (default: 5)
- `DATABASE_URL` - PostgreSQL connection string
- `SUPABASE_URL` - Supabase instance URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

### What it tests

1. **High-Frequency Step Completion**: Creates many independent steps and completes them as fast as possible, measuring:
   - Steps per second
   - Events per second
   - Memory usage
   - Success rates

2. **Concurrent Flows**: Runs multiple flows simultaneously to test system concurrency, measuring:
   - Overall throughput
   - Task completion rates
   - Event delivery rates
   - Memory efficiency

### Output

The script provides detailed performance metrics including:
- Total execution time
- Steps/events per second
- Success rates
- Memory usage statistics
- Pretty-formatted summary tables

### Scale

This benchmark significantly increases the scale from the original integration tests:
- High-frequency test: 20 → 100 steps (5x increase)
- Concurrent flows: 8 → 20 flows (2.5x increase)
- Better batching and parallel processing for realistic performance testing