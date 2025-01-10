---
title: "Step Type: Upsert Row"
draft: true
---

hello

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { Flow } from "./Flow.ts";
import type { Database } from "../../types.d.ts";

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const supabase: SupabaseClient = {} as SupabaseClient;

type UpsertHandlerInput = {
  data: Database["schema"]["Tables"]["table"]["Row"];
  run: { ownerId: string };
};

type UpsertHandlerOutput = Database["schema"]["Tables"]["table"]["Row"];

const UpsertHandler = async ({
  data,
  run: { ownerId },
}: UpsertHandlerInput): Promise<UpsertHandlerOutput> => {
  const response = await supabase
    .schema("schema")
    .from("table")
    .upsert({
      ...data,
      owner_id: ownerId,
    })
    .returns<UpsertHandlerOutput>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
};

const ProcessDataFlow = new Flow<RunPayload>()
  .step("fetchData", async ({ run: { objectId } }) => {
    // Fetch data logic
    const data = { id: objectId, value: "some data" };
    return data;
  })
  .step("upsertData", ["fetchData"], UpsertHandler);

export default ProcessDataFlow;

export type StepsType = ReturnType<typeof ProcessDataFlow.getSteps>;
```
