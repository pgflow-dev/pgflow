## 📋  pgflow Benchmark – Test-Quality Assessment  
*(vetted on the script you provided)*  

### 1. General Impression
The script is well-structured, readable and automates two meaningful scenarios (high-frequency single flow & many concurrent flows).  
However, several design/measurement choices limit its ability to give **trustworthy, comparable and reproducible** performance numbers.

---

### 2. Key Test-Design Observations

| Area | What Happens | Impact |
|------|--------------|--------|
| Workload size | Defaults: `STEP_COUNT=100`, `CONCURRENT_FLOWS=20`, `STEPS_PER_FLOW=5` | May be too small to surface bottlenecks in DB, networking or GC. |
| Flow / Step creation | Steps are added one‐by‐one in a tight loop (100× `SELECT pgflow.add_step …`). | Creation time is included in *totalDuration* but not in *throughput* metrics – hides true end-to-end cost. |
| Task polling | `pollForTasks` is called once per test with large limits. | Single large query can swamp memory, skew latency. |
| Concurrency limits | Batch completion (`COMPLETION_BATCH_SIZE=10`) & 5-flow parallelism in second test. | May under-utilise system when DB / CPU can handle more. |
| Event subscription | Uses single `run.on('*')` handler; no back-pressure logic. | Possible event loss if client cannot keep up ⇒ under-counting. |
| DB permissions | `grantMinimalPgflowPermissions` runs every test. | Harmless but extra latency inside timing window. |
| No environment isolation | Two tests run against same DB without cleanup. | Remaining rows/events might influence second test (indexes, WAL, notifications). |

---

### 3. Metrics & Measurement Issues

| Metric | How it is calculated | Issue |
|--------|----------------------|-------|
| `stepsPerSecond` / `tasksPerSecond` | `completedSteps / completionDuration` | Ignores flow/step creation & subscription setup. Over-optimistic. |
| `eventsPerSecond` | `eventsReceived / totalDuration` | Duration base differs from steps/s ⇒ not directly comparable. |
| `peakMemory` | Max of `process.memoryUsage().heapUsed` samples on each event | Misses non-heap RSS, sampling only when events arrive ⇒ may miss real peak. |
| Success rates | Expected events = `steps × 2` | Flow-level events (`run_started`, `run_completed`, etc.) are ignored ⇒ delivery rate may appear <100 % even if none were lost. |
| Timer resolution | `Date.now()` (ms) | Coarse for sub-second operations, especially with 100-step default. |

---

### 4. Test-Related Factors That Can Skew Performance

1. **Network round-trips** for step creation dominate small workloads.  
2. **GC pauses** aren’t accounted for—peak memory may be understated if GC runs after last sample.  
3. **Connection pool limits** (default in `postgres` and `@supabase/supabase-js`) can throttle concurrency but aren’t monitored.  
4. **Notification flood**: Large step counts → many `LISTEN/NOTIFY` messages; if the listener backlog grows, event loss or Node.js event-loop delay occurs and isn’t detected.  
5. **Timeouts** (`MAX_COMPLETION_TIME_MS=60 s`) might be hit on slower machines, counting as failure even though system would complete correctly with more time.  
6. **No warm-up / GC stabilisation** between tests**;** second test may run with higher baseline memory.

---

### 5. Recommendations

1. **Separate measurement phases**  
   • Measure and report *creation*, *task processing*, *event delivery* individually.  
   • Use the same duration denominator for all throughput numbers.

2. **Scale realistically**  
   • Provide env vars that allow thousands of steps/flows when running on CI or prod-like hardware.  
   • Add a *warm-up* iteration and discard its metrics.

3. **Improve memory & CPU telemetry**  
   • Sample `process.memoryUsage().rss` and optionally `process.cpuUsage()` on an interval (e.g. `setInterval`).  
   • Force a manual `global.gc()` (with `--expose-gc`) before starting measurement to stabilise baseline.

4. **Detect event loss**  
   • Compare expected vs received counts *including run-level events*.  
   • Add an assertion that no `supabase-js` channel reports “buffer overflow”.

5. **Use high-resolution timers**  
   • `performance.now()` (from `perf_hooks`) gives µs resolution.

6. **Cleanup between tests**  
   • Delete flows / partition tables or run each test in its own DB schema to avoid cross-test interference.

7. **Expose connection-pool stats**  
   • Log pool size, wait count, idle count to understand DB saturation.

8. **Automate variance tracking**  
   • Run each scenario multiple times and output mean ± stdev.

Implementing the above will make the benchmark far more reliable and its numbers actionable.
