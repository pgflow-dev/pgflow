---
title: pgflow
draft: true
template: splash
hero:
  tagline: Supabase-native open-source type-safe workflow engine with realtime updates
  actions:
    - text: Check how simple it is
      link: "#how-it-works"
      icon: down-caret
---

You can run whole parallel workflow from start to completion (or error)
in the browser like a regular async function on which you can await.
You can also monitor events for all the steps and their return values or errors too.

## Examples

```typescript
// trigger a new flow run
const flowRun = runFlow(ProcessVoiceMemo, {
  voiceMemoId: id,
  ownerId: currentUser.id,
  language: "en",
});

// monitor all the step statuses
flowRun.subscribe("yourStepName:eventName", (payload) => process(payload));

// monitor mid-step realtime progress
flowRun.subscribe("yourStepName:progress", (progress) =>
  console.log(`flowRun progress: ${progresss}%`),
);

// treat whole run as a promise
try {
  const { data, error } = await flowRun;
  console.log("Key takeaways from voice memo: ", data.keyTakeaways.join(", "));
} catch (runError) {
  // any step error will result in promise rejection
}
```
