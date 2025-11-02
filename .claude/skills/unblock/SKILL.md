---
name: unblock
description: Use when user says "unblock", "am I overthinking", "help me ship", "ship check". Diagnostic tool using Yes/No questions to identify if caution is justified or paranoia. Provides actionable prescriptions.
allowed-tools: AskUserQuestion
---

# unblock

Break analysis paralysis by diagnosing if caution is justified or paranoia.

## Process

### 1. Context (via AskUserQuestion tool)

Analyze recent session to infer what's happening, then use AskUserQuestion to confirm:

**Step 1**: Review last 10-20 messages for patterns:
- Repeated refactoring/rewrites
- Long research/planning without implementation
- Working on meta-tools instead of core features
- Multiple "what if" or "should I" questions

**Step 2**: Use AskUserQuestion with inferred context:
```
question: "What are you stuck on?"
options:
  - [Inferred from session, e.g. "Perfecting the unblock skill for 1+ hour"]
  - [Alternative inference if applicable]
  - "Something else entirely"
```

If time unclear, follow with:
```
question: "How long on this without shipping?"
options: ["< 30 mins", "30m - 2h", "2h - 1 day", "> 1 day"]
```

### 2. Diagnostic (15-20 questions via AskUserQuestion tool)

<critical>
ALL questions MUST use AskUserQuestion tool - including initial context.
Interactive buttons prevent overthinking and force decisions.
</critical>

Ask in 3-4 batches of 4-5 questions. Adapt based on context.

**Batch 1: Risk & Velocity**
- Can users lose data/money? (Stakes)
- Shipped last 2 weeks? (Velocity)
- >2 hours researching? (Analysis)
- Reputation damage worry? (Fear)

**Batch 2: Users & Demand**
- Anyone asked for this? (Demand)
- Users complain if nothing ships? (Pressure)
- Solving real problem? (Validation)
- Rewritten without feedback? (Iteration)

**Batch 3: Complexity & Focus**
- Ship with half the code? (Scope)
- >3 active blockers? (Focus)
- Complexity for "professionalism"? (Theater)
- More thinking than coding? (Action)

**Batch 4: pgflow & Momentum**
- Critical onboarding path? (Priority)
- Treating MVP like enterprise? (Scale)
- Fear from actual feedback? (Reality)
- Know NOT shipping kills projects? (Truth)

### 3. Score

Count flags:
- **RED**: Low stakes + high fear + no users = Paranoia
- **YELLOW**: Mixed signals
- **GREEN**: Real stakes + users waiting = Justified

### 4. Diagnose

```
## Diagnosis: [Paranoia/Mixed/Justified]

### Evidence:
- RED: [specific findings]
- GREEN: [what works]

### Problem: [1 paragraph root cause]

### Cost: [Quantified loss]

### Prescription: [See prescriptions.md]
```

### 5. Follow-up
"Want help shipping the blocked thing now?"

## Resources

- [patterns.md](patterns.md) - Pattern detection
- [prescriptions.md](prescriptions.md) - Treatments by type