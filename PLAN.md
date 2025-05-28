# Implementation Plan: Replace Custom State Management with @pgflow/client

**Goal**: Replace playground's 800-line custom state management with 60 lines of idiomatic @pgflow/client usage.

## Overview

The current playground app has grown into a complex mess with custom state management that duplicates functionality already provided by @pgflow/client. This plan will:

- ✅ **Eliminate ~400 lines** of custom state management code
- ✅ **Fix performance issues** (timer-driven re-renders, channel errors)
- ✅ **Resolve state sync problems** between left/right panels  
- ✅ **Use proper @pgflow/client patterns** as shown in the README
- ✅ **Improve maintainability** significantly

## Current Problems

1. **Duplicated Data Layer**: Custom `fetchFlowRunData()` re-fetches data that `startFlow()` already provides
2. **Home-grown Real-time**: Custom `observeFlowRun()` recreates subscription logic that `FlowRun.on()` already handles
3. **Performance Issues**: Timer-driven re-renders every second even for completed flows
4. **Race Conditions**: Complex workarounds (sessionStorage, retries) fighting problems the client already solves
5. **State Sync Issues**: Two different data representations causing panel inconsistencies

## Target Architecture

- **PgflowClientProvider**: Single client instance for the whole app
- **useFlowRun(runId)**: 25-line hook replacing FlowRunProvider
- **Direct FlowRun/FlowStep usage**: No more custom state synchronization
- **Event-driven updates**: Use `run.on('*', callback)` instead of timers
- **~60 lines total** replacing ~400 lines of custom code

---

## FILE CHANGES

### FILES TO DELETE (after migration complete)
- ❌ `components/flow-run-provider.tsx` (~250 lines)
- ❌ `lib/db.ts` (~150 lines) 
- ❌ `lib/hooks/use-start-analysis.ts` (will be recreated, much simpler)
- ❌ Custom observeFlowRun/fetchFlowRunData logic

### FILES TO CREATE

#### 1. `components/pgflow-client-provider.tsx` (~40 lines)
```tsx
'use client';
import { createContext, useContext, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { PgflowClient } from '@pgflow/client';
import type { Database } from '@/supabase/functions/database-types';

const PgflowClientContext = createContext<PgflowClient | null>(null);

export function PgflowClientProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    return new PgflowClient(supabase);
  }, []);

  return (
    <PgflowClientContext.Provider value={client}>
      {children}
    </PgflowClientContext.Provider>
  );
}

export function usePgflowClient() {
  const ctx = useContext(PgflowClientContext);
  if (!ctx) throw new Error('usePgflowClient must be used inside PgflowClientProvider');
  return ctx;
}
```

#### 2. `hooks/use-flow-run.ts` (~25 lines)
```tsx
'use client';
import { useEffect, useState } from 'react';
import { usePgflowClient } from '@/components/pgflow-client-provider';
import type { FlowRun } from '@pgflow/client';

export function useFlowRun(runId: string) {
  const client = usePgflowClient();
  const [run, setRun] = useState<FlowRun<any> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    
    let unsubscribe = () => {};
    
    (async () => {
      try {
        const flowRun = await client.getRun(runId);
        if (!flowRun) {
          throw new Error('Run not found');
        }
        
        setRun(flowRun);
        setLoading(false);
        
        // Subscribe to all run events for real-time updates
        unsubscribe = flowRun.on('*', () => {
          // Force re-render by creating new object reference
          setRun({ ...flowRun });
        });
        
      } catch (err) {
        setError(err as Error);
        setLoading(false);
      }
    })();

    return () => unsubscribe();
  }, [runId, client]);

  return { run, error, loading };
}
```

#### 3. `hooks/use-now.ts` (~15 lines)
```tsx
'use client';
import { useEffect, useState } from 'react';

export function useNow(active: boolean = true) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);
    
    return () => clearInterval(id);
  }, [active]);

  return now;
}
```

### FILES TO MODIFY

#### 1. `app/layout.tsx`
```tsx
// Add PgflowClientProvider wrapper
import { PgflowClientProvider } from '@/components/pgflow-client-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <PgflowClientProvider>
            <LoadingStateProvider>
              {children}
            </LoadingStateProvider>
          </PgflowClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

#### 2. `app/websites/runs/[run_id]/page.tsx`
```tsx
'use client';
import { useParams } from 'next/navigation';
import { useFlowRun } from '@/hooks/use-flow-run';
import WebsiteAnalysisUI from '@/components/website-analysis-ui';
import FlowRunDetails from '@/components/flow-run-details';

export default function RunPage() {
  const { run_id } = useParams<{ run_id: string }>();
  const { run, loading, error } = useFlowRun(run_id);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error.message}</div>;
  }

  if (!run) {
    return <div className="p-6">Run not found</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row">
      {/* Technical details panel */}
      <div className="w-full lg:w-[35%] xl:w-[30%] order-first lg:order-last mb-6 lg:mb-0">
        <FlowRunDetails run={run} />
      </div>

      {/* Main UI panel */}
      <div className="w-full lg:w-[65%] xl:w-[70%] lg:pr-6 order-last lg:order-first">
        <WebsiteAnalysisUI run={run} />
      </div>
    </div>
  );
}
```

#### 3. `components/website-analysis-ui.tsx`
Replace props with FlowRun usage:
```tsx
interface WebsiteAnalysisUIProps {
  run: FlowRun<any>;
}

export default function WebsiteAnalysisUI({ run }: WebsiteAnalysisUIProps) {
  // Direct FlowRun API usage - no more complex state management!
  const isCompleted = run.status === 'completed';
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'started';
  
  // Access step data directly
  const summaryStep = run.step('summary');
  const tagsStep = run.step('tags');
  const websiteStep = run.step('website');
  
  const summaryCompleted = summaryStep.status === 'completed';
  const summary = summaryCompleted ? summaryStep.output : null;
  
  // Get website URL from input
  const websiteUrl = (run.input as any)?.url || '';
  
  // ... rest of component logic simplified
}
```

#### 4. `components/flow-run-details.tsx`
Replace props and add timer optimization:
```tsx
import { useNow } from '@/hooks/use-now';

interface FlowRunDetailsProps {
  run: FlowRun<any>;
}

export default function FlowRunDetails({ run }: FlowRunDetailsProps) {
  // Only run timer when flow is actually running
  const currentTime = useNow(run.status === 'started');
  
  // Direct FlowRun API usage
  const steps = run.stepStates; // Already ordered by step_index
  const tasks = run.stepTasks;   // Already ordered by step_index
  
  // ... rest of component simplified
}
```

#### 5. `lib/services/start-analysis.ts`
```tsx
import { usePgflowClient } from '@/components/pgflow-client-provider';

export async function startWebsiteAnalysis(url: string): Promise<string> {
  if (!url) throw new Error('URL is required');

  // Get global client instance
  const client = usePgflowClient();
  
  // Get authenticated user
  const { data, error: authError } = await client.supabase.auth.getUser();
  if (!data.user || authError) {
    const err = new Error('AUTH_REQUIRED');
    (err as any).code = 'AUTH_REQUIRED';
    throw err;
  }

  try {
    // Use client's startFlow method - returns complete FlowRun instance
    const run = await client.startFlow('analyze_website', {
      url,
      user_id: data.user.id || 'anonymous',
    });

    return run.run_id;
  } catch (error: any) {
    // Map PgflowClient errors to user-friendly messages
    if (error.message?.includes('FLOW_NOT_FOUND')) {
      throw new Error('The analyze_website flow is not available. Please check your setup.');
    }
    if (error.message?.includes('INVALID_INPUT_JSON')) {
      throw new Error('Invalid input provided for website analysis.');
    }
    
    throw error;
  }
}
```

#### 6. `lib/hooks/use-start-analysis.ts` (simplified)
```tsx
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startWebsiteAnalysis } from '@/lib/services/start-analysis';

export function useStartAnalysis() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function start(url: string) {
    setError(null);
    startTransition(async () => {
      try {
        const runId = await startWebsiteAnalysis(url);
        router.push(`/websites/runs/${runId}`);
      } catch (err: any) {
        if (err?.code === 'AUTH_REQUIRED') {
          localStorage.setItem('pendingAnalysisUrl', url);
          router.push('/sign-in');
          return;
        }
        setError(err.message ?? 'Something went wrong');
      }
    });
  }

  return { start, error, isPending };
}
```

---

## IMPLEMENTATION ORDER

### Phase 1: Setup New Architecture (Safe)
1. ✅ Create `components/pgflow-client-provider.tsx`
2. ✅ Create `hooks/use-flow-run.ts`  
3. ✅ Create `hooks/use-now.ts`
4. ✅ Add PgflowClientProvider to `app/layout.tsx`
5. ✅ Test: Verify provider works, no errors in console

### Phase 2: Migrate Page Component
6. ✅ Modify `app/websites/runs/[run_id]/page.tsx` to use `useFlowRun`
7. ✅ Update props passed to child components (temporarily support both old/new)
8. ✅ Test: Verify page loads and FlowRun data appears in console

### Phase 3: Migrate UI Components  
9. ✅ Update `components/website-analysis-ui.tsx` to use FlowRun directly
10. ✅ Update `components/flow-run-details.tsx` to use FlowRun + useNow
11. ✅ Test: Verify UI renders correctly and real-time updates work

### Phase 4: Migrate Service Layer
12. ✅ Update `lib/services/start-analysis.ts` to use global client
13. ✅ Update `lib/hooks/use-start-analysis.ts` (simplified version)
14. ✅ Test: Verify flow starting works correctly

### Phase 5: Cleanup
15. ✅ Delete `components/flow-run-provider.tsx`
16. ✅ Delete `lib/db.ts` 
17. ✅ Remove sessionStorage workarounds
18. ✅ Remove unused imports throughout codebase
19. ✅ Run `npm run build` and `npm run lint`
20. ✅ Final testing

### Rollback Strategy
Keep old files in git until Phase 5. If something breaks:
1. Revert changes to page.tsx 
2. Re-import FlowRunProvider temporarily
3. Fix issues before proceeding

---

## TESTING & VERIFICATION

### After Each Phase
- ✅ **Console logs**: No subscription errors or duplicate channels
- ✅ **Performance**: React DevTools shows minimal re-renders
- ✅ **Real-time**: Flow progress updates appear immediately
- ✅ **Navigation**: Direct URL access, refresh, back/forward work
- ✅ **Multiple tabs**: Opening same run in multiple tabs works

### Final Verification
- ✅ **Performance**: Lighthouse interaction-to-next-paint improves
- ✅ **Memory**: Chrome DevTools shows no memory leaks
- ✅ **Functionality**: All features work as before
- ✅ **Code size**: Bundle size reduced by ~15kB

### Load Testing
- ✅ Start multiple flows simultaneously
- ✅ Monitor flows across multiple browser tabs
- ✅ Test with slow network connections
- ✅ Verify cleanup when flows complete

---

## EXPECTED BENEFITS

### Performance
- ✅ **No timer spam**: Components only re-render on actual state changes
- ✅ **Efficient subscriptions**: One real-time channel per run (managed by @pgflow/client)
- ✅ **No duplicate fetching**: Use data already provided by startFlow()
- ✅ **Automatic cleanup**: FlowRun handles disposal when no longer needed

### Code Quality  
- ✅ **~400 lines removed**: Massive reduction in custom state management
- ✅ **Better maintainability**: Standard @pgflow/client patterns
- ✅ **Type safety**: Full TypeScript integration with FlowRun/FlowStep
- ✅ **Fewer bugs**: Eliminate race conditions and sync issues

### User Experience
- ✅ **Faster loading**: No unnecessary API calls
- ✅ **Consistent state**: Left/right panels always synchronized  
- ✅ **Better reliability**: Proper error handling and edge cases covered
- ✅ **Smoother interactions**: Event-driven updates instead of polling

---

## COMPLETION CHECKLIST

- [ ] Phase 1: New architecture setup complete
- [ ] Phase 2: Page component migrated  
- [ ] Phase 3: UI components migrated
- [ ] Phase 4: Service layer migrated
- [ ] Phase 5: Cleanup complete
- [ ] All tests passing
- [ ] Performance improvements verified
- [ ] Documentation updated

**Target completion**: Replace 800 lines of complex state management with 60 lines of idiomatic @pgflow/client usage, achieving significantly better performance and maintainability.