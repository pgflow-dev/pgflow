---
title: Frontend simplicity
---

You can run whole parallel workflow from start to completion (or error)
in the browser like a regular async function on which you can await.
You can also monitor events for all the stpes and their return values or errors too.

## Examples

```typescript
// trigger a new flow run
const flowRun = runFlow(ProcessVoiceMemo, {
  voiceMemoId: id,
  ownerId: currentUser.id,
  language: "en",
});

// realtime Flow progress
flowRun.subscribe("yourStepName:eventName", (payload) => process(payload));

// realtime step progress
flowRun.subscribe("yourStepName:progress", yourStepNameResults);

// treat whole run as a promise
try {
  const runOutput = await flowRun;
} catch (runError) {
  // any step error will result in promise rejection
}
```

