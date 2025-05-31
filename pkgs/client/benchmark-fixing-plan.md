# 🔧 Benchmark Fixing Plan

This document tracks the implementation of fixes to address the issues identified in `report.md`. Each task will be checked off as completed.

## 📋 Task Status

### Phase 1: Critical Measurement Fixes (High Impact, Easy to Fix)

- [x] **Separate timing phases** - Measure creation, execution, and cleanup separately
  - [x] Extract flow/step creation into separate timed phase
  - [x] Measure only task execution in throughput calculations
  - [x] Report creation time separately from execution time
  - [x] Use consistent duration denominators for all throughput metrics

- [x] **Fix event counting methodology** - Include all expected events
  - [x] Count run-level events (run_started, run_completed) in expected totals
  - [x] Count step-level events (step_started, step_completed) properly
  - [x] Update success rate calculations to use correct expected event counts
  - [x] Add event type breakdown in reporting

- [x] **Upgrade to high-resolution timers** - Replace Date.now() with performance.now()
  - [x] Import `performance` from `perf_hooks`
  - [x] Replace all `Date.now()` calls with `performance.now()`
  - [x] Update duration calculations to handle microsecond precision
  - [x] Format output to show sub-millisecond timing when relevant

- [x] **Move DB setup outside measurement window** - Don't include setup in performance metrics
  - [x] Move `grantMinimalPgflowPermissions()` outside timing
  - [x] Move flow/step creation outside execution timing
  - [x] Only measure actual task polling and completion
  - [x] Report setup time separately for transparency

### Phase 2: Scale and Isolation Improvements (Medium Impact, Easy to Fix)

- [ ] **Increase default scale for realistic testing**
  - [ ] Change default `STEP_COUNT` from 100 to 1000
  - [ ] Change default `CONCURRENT_FLOWS` from 20 to 50
  - [ ] Add environment variable documentation
  - [ ] Add scale recommendations for different hardware types

- [ ] **Add proper test isolation and cleanup**
  - [ ] Implement flow cleanup between tests
  - [ ] Clear event subscriptions properly
  - [ ] Add database state reset between tests
  - [ ] Verify clean state before each test starts

- [ ] **Make all limits configurable via environment variables**
  - [ ] Add `COMPLETION_BATCH_SIZE` env var
  - [ ] Add `CONCURRENT_FLOW_PROCESSING` env var
  - [ ] Add `MAX_COMPLETION_TIME_MS` env var
  - [ ] Add `POLLING_RETRIES` and `POLLING_TIMEOUT` env vars

### Phase 3: Enhanced Telemetry and Reliability (Medium Impact, Moderate Effort)

- [ ] **Implement interval-based memory sampling**
  - [ ] Add `setInterval` for regular memory sampling during tests
  - [ ] Track both RSS and heap memory usage
  - [ ] Record memory samples with timestamps
  - [ ] Report memory usage graphs/trends, not just peak

- [ ] **Detect event loss and channel overflow**
  - [ ] Monitor Supabase channel status for buffer overflow
  - [ ] Add assertions for event delivery rates
  - [ ] Log warnings when event loss is detected
  - [ ] Add retry mechanisms for critical events

- [ ] **Add warm-up iterations and GC stabilization**
  - [ ] Implement warm-up runs before actual measurement
  - [ ] Add `--expose-gc` flag recommendation in documentation
  - [ ] Call `global.gc()` if available before measurements
  - [ ] Discard warm-up metrics from final results

- [ ] **Implement multiple runs for statistical validity**
  - [ ] Run each test scenario multiple times (default: 3)
  - [ ] Calculate mean, standard deviation, min, max for metrics
  - [ ] Report confidence intervals
  - [ ] Detect and flag outlier runs

### Phase 4: Advanced Monitoring and Diagnostics (Lower Priority)

- [ ] **Add connection pool monitoring**
  - [ ] Expose postgres connection pool statistics
  - [ ] Monitor Supabase client connection usage
  - [ ] Log pool saturation warnings
  - [ ] Add pool configuration recommendations

- [ ] **Implement CPU usage tracking**
  - [ ] Sample `process.cpuUsage()` during tests
  - [ ] Track CPU utilization trends
  - [ ] Report CPU efficiency metrics
  - [ ] Correlate CPU usage with performance

- [ ] **Add network latency and error monitoring**
  - [ ] Track database query latencies
  - [ ] Monitor network timeouts and retries
  - [ ] Log connection errors and recovery
  - [ ] Add network quality metrics

- [ ] **Enhance reporting and visualization**
  - [ ] Add performance comparison with previous runs
  - [ ] Generate performance graphs/charts (optional)
  - [ ] Export results to JSON/CSV for analysis
  - [ ] Add performance regression detection

## 🎯 Success Criteria

After completing these fixes, the benchmark should:

1. ✅ **Accurate Metrics**: Report realistic performance numbers (20-50 steps/sec expected)
2. ✅ **Reliable Event Tracking**: 95%+ event delivery rate consistently
3. ✅ **Proper Isolation**: Each test runs in clean environment
4. ✅ **Statistical Validity**: Multiple runs with confidence intervals
5. ✅ **Actionable Insights**: Clear bottleneck identification
6. ✅ **Reproducible Results**: Consistent performance across runs

## 📝 Notes

- This plan addresses all issues identified in `report.md`
- Tasks are ordered by impact and implementation difficulty
- Each completed task should be checked off with implementation details
- Plan will be updated as new issues are discovered during implementation

---

**Status**: Phase 1 Complete! Moving to Phase 2
**Last Updated**: 2025-05-31
**Next Action**: Begin Phase 2 scale improvements

## 🎉 Phase 1 Results Summary:
- ✅ **Separated timing phases**: Setup (322ms) vs Execution (1.18s) now clearly distinguished
- ✅ **High-resolution timing**: Using performance.now() with microsecond precision
- ✅ **Proper event counting**: Added event breakdown showing poor event delivery (0.5% vs expected)
- ✅ **Realistic metrics**: Task completion now 247 steps/sec (vs misleading 263 before)
- ✅ **Better transparency**: Setup costs are visible and excluded from performance metrics

**Key Discovery**: Event delivery is extremely poor (0.5-10%) indicating real issues with realtime system!