# Map DSL

## Two Patterns for Map

### Pattern 1: Reference Existing Array Step

```ts
// First create an array step
.array('survey_data', ({ participants, questions }) => 
  participants.map(p => ({ participant: p, questions }))
)

// Then reference it in map
.map({
  slug: 'send_surveys',
  array: 'survey_data'  // String reference to existing array step
}, ({ participant, questions }) => ...)
```

### Pattern 2: Create Array on Demand

```ts
.map({
  slug: 'send_surveys',
  dependsOn: ['participants', 'questions'],
  array: ({ participants, questions }) => participants.map(p => ({ participant: p, questions }))  // Function creates ghost array step
}, ({ participant, questions }) => ...)
```

Under the hood for Pattern 2, the DSL creates a `gen_array_send_surveys` ghost step which gets ['participants', 'questions'] as dependencies and uses the `array` handler to produce an array.

## Key Concepts

- **Pattern 1**: Direct dependency on existing array step, no ghost step generated
- **Pattern 2**: DSL generates ghost array step, map depends on it
- Both patterns spawn one task per array element with preserved `task_index`
- Results are assembled back into an array ordered by `task_index`
