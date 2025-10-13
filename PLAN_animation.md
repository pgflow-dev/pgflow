# Hero Section Animation Plan

## Overview

An animated DAG visualization showcasing pgflow's core capabilities: parallel execution and automatic retry handling. The animation displays a content generation workflow executing in real-time with visual feedback for all state transitions.

## What We're Building

### Animation Description

A horizontal DAG flow visualization with 5 nodes arranged left-to-right:

```
[fetchArticle] → [summarize]      → [publish]
                 [extractKeywords]
                 [generateImage]
```

**Visual Style:**
- React Flow aesthetic: rectangular nodes with rounded corners (8px border radius)
- Orthogonal connections with smooth curved corners (90-degree routing)
- Clean, professional design using site color palette
- Subtle pulse animation on active nodes
- Node dimensions: 140×50px

**Animation Sequence (~8 seconds, loops):**

1. **fetchArticle** starts → fails (red flash) → retries with badge "1/3" → succeeds
2. All three parallel steps start simultaneously (visual parallelism demonstration)
3. Steps complete at staggered intervals showing independence:
   - extractKeywords completes first
   - summarize completes second
   - generateImage completes last
4. **publish** waits for all three, then starts and completes
5. Hold final state, fade, restart loop

**Color States:**
- **Pending**: Gray (#2a3d39) - not yet started
- **Running**: Blue (#3B82F6) with pulse effect
- **Failed**: Red (#DC2626) - brief failure state
- **Retrying**: Orange (#F59E0B) with retry counter badge
- **Success**: pgflow accent green (#007b6e)

## Why We're Building This

### Problem Statement

The current hero section uses a static logo. This doesn't communicate pgflow's key differentiators:
1. Workflows handle failures gracefully with automatic retries
2. Independent tasks run in parallel without manual coordination
3. The system provides clear visual feedback on execution state

### Value Proposition

The animation instantly demonstrates these capabilities without requiring users to read documentation or imagine how the system works. It answers the implicit question: "How is this different from writing my own job queue?"

## Where It Will Be Used

**Primary Location:** Landing page hero section (index.mdx)

Currently, the hero displays:
- Title: "Dead-simple workflow orchestration for Supabase"
- Tagline: "AI workflows you can actually debug"
- Static pgflow logo

**Replacement Strategy:**
Replace the static logo with the animated DAG to show, not tell, what pgflow does.

**Current Development Location:** `/animation.mdx` for isolated development and iteration

## Target Audience

### Primary Personas

**1. Backend Developers Building AI Workflows**
- Pain: Complex orchestration logic for multi-step AI processes
- Need: Reliable execution with failure handling
- Takeaway: "This handles retries automatically so I don't have to"

**2. Supabase Users Scaling Beyond Simple Functions**
- Pain: Manual coordination between Edge Functions, queues, and cron jobs
- Need: Workflow orchestration that fits their existing stack
- Takeaway: "This replaces all the manual plumbing I'm doing now"

**3. Engineers Evaluating Workflow Engines**
- Pain: Comparing pgflow to Temporal, Inngest, DBOS, etc.
- Need: Quick understanding of core capabilities
- Takeaway: "I can see exactly what this does - parallel execution + retries"

### What They Should Understand in 10 Seconds

1. **Visual Parallelism**: Three tasks run simultaneously without coordination code
2. **Automatic Retries**: Failed steps retry automatically with visible feedback
3. **Dependency Management**: Final step waits for all dependencies before executing
4. **Real-time Observability**: Every state change is visible

## Technical Implementation

**Technology Stack:**
- Vanilla JavaScript (no dependencies)
- SVG for rendering
- CSS animations for state transitions
- Inline script in MDX for simplicity

**Performance:**
- Lightweight (~100 lines of code)
- No external libraries
- Smooth 60fps animations
- Works on all modern browsers

**Future Considerations:**
- Pause/resume on hover (for users who want to study the flow)
- Adjustable animation speed
- Integration with actual pgflow execution data (advanced feature)

## Success Metrics

**Qualitative Goals:**
- Users immediately understand parallel execution capability
- Retry behavior is clear and reassuring (not alarming)
- Visual style matches professional standards (React Flow reference)

**Future Quantitative Metrics:**
- Increased conversion from landing page to installation
- Reduced "what does this do?" questions in Discord
- Higher engagement time on landing page

## Next Steps

1. ✅ Create DAG structure and animation sequence
2. ✅ Implement React Flow visual style
3. ✅ Fix orthogonal routing corner smoothness
4. ⏳ Fine-tune timing and polish animations
5. ⏳ Test responsiveness on mobile/tablet
6. ⏳ Replace hero logo with animation
7. ⏳ Gather feedback from early users
