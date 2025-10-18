---
argument-hint: <what to evaluate> [optional: counts, additional criteria, additional choices]
description: Generate suggestions, invent criteria, rate them, and recommend the best option
---

Evaluate: $ARGUMENTS

## Parse Arguments

**IMPORTANT:** If arguments are provided above, focus ONLY on them. Ignore preceding conversation unless arguments are empty.

Extract from arguments (all optional, use defaults if not specified):
- **Suggestion count:** Look for "N options/suggestions/choices/ideas" (default: 10)
- **Criteria count:** Look for "N criteria/with N criteria" (default: 5)
- **User criteria:** Look for "criteria:", "check:", "consider:", "rate by:" followed by list (additional to generated)
- **User suggestions:** Look for "my ideas:", "also:", "include:" followed by list (additional to generated)

Examples:
- "5 options for file location" → 5 generated suggestions, 5 generated criteria
- "naming with 3 criteria" → 10 generated suggestions, 3 generated criteria
- "database approach, criteria: performance, cost" → 10 generated, 5 generated + 2 user criteria
- "file location, my ideas: src/config.ts, .config/app.ts" → 10 generated + 2 user suggestions, 5 generated criteria
- "8 options with 4 criteria for errors, consider: DX, backwards-compat" → 8 generated, 4 generated + 2 user criteria

If no arguments provided, infer topic from conversation.

## 1. Generate Suggestions
List N suggestions (extracted count or 10). Then add any user-provided suggestions.

## 2. Invent Criteria
Generate N criteria (extracted count or 5) that match the context. Then add any user-provided criteria.
Keep all descriptions brief (1 line each).

## 3. Rating Matrix
Rate ALL suggestions (generated + user-provided) against ALL criteria (generated + user-provided) using 1-5 scale:
- **5** = ⭐ (excellent)
- **4** = ✅ (good)
- **3** = 3 (okay)
- **2** = 2 (poor)
- **1** = 1 (bad)

Table format (columns adjust based on total criteria count):
```
| Option | C1 | C2 | C3 | C4 | C5 | [C6...] | Total |
|--------|----|----|----|----|----|---------| ------|
| Opt 1  | ⭐ | ✅ | ⭐ | 3  | ✅ | ...     | 21    |
| Opt 2  | ✅ | 2  | 3  | ⭐ | 1  | ...     | 15    |
```

## 4. Criteria Legend
List ALL criteria (generated + user-provided):
- **C1: [Name]** - [Brief description]
- **C2: [Name]** - [Brief description]
(etc. for all criteria)

## 5. Top 3 Analysis
For each top option (concise, 2-3 lines each):
- **Strengths:** [Key advantages]
- **Weaknesses:** [Key limitations]
- **Pick when:** [Conditions favoring this]
- **Skip when:** [Conditions favoring alternatives]

## 6. Recommendation
```
✅ PICK: [Option name]

Why: [1-2 sentences citing top criteria]
Trade-off: [What you sacrifice vs #2]
```

Keep output dense and concise. Focus on actionable insights.
