:::

1. MVP will allow only 1:1 queue:flow mappings, because it simplifies a lot.
   Queue is created when creating a flow, in pgflow.create_flow() function.

2. No, we will start with either static delay or simple exponential and
   I do not plan to expand on it further.

   The backoff will be calculated by the retry attempts, that can be deducted
   from pgmq's "read_ct" counter.

   No need for jitter for now.

3. **Execution Timeouts**
   I'm not sure about flow timeouts, I think for MVP we should probably
   skip them and I'm not even sure if I want to have them for the steps too.

   I would be definitely adding them in future.

4. We want everything to by statically typed in TypeScript, because the main
   way to define flows would be to use TS DSL.

   So a condition must be a JSON-serializable object that will get saved
   in a JSONB column.

   My initial idea for conditions was to just provide a JSON object that we
   will use to perform containment check on the step inputs using @> operator.

   I am considering expanding it to more robust condition, but they would need
   to be defined in JSON-serializable way.

   I do not want to have any SQL snippets in conditions, because I cannot
   statically type them and they can fail at runtime.

   No, conditions should probably only be able to reference step inputs.

5. Yes it should be able to disable retries per step or override their params.
   How those circuit breakers should work and what would be the benefit of them?
   What is retry budget? Do we have a distributed system really? Everything
   lives in a single postgres instance.

6. No we do not want to support dependency resolution at runtime,
   but conditions could be used to implement something similar.
   Steps should not be able to add new steps during runtime,
   but I plan to have fanout steps that will spawn either multiple tasks
   or multiple subflows, one per the input array item.
   Those are meant to be aggregated back to the output array when completed.

   It's not for MVP tho!!

### Cross-Cutting Concerns
7. We will advise users to not put anything sensitive into flow options,
   by writing docs and also not having handlers any ability to access the
   step options.

   We will provide a Context object that users can define in the Flow DSL,
   that will be passed to the step handlers at runtime and will encourage
   users to use this Context object to store sensitive data.

8. What you mean by tracked metadata for options and options affecting metric?

9. Versioning is a big problem for my project - I have few ideas how to solve
   it (basically topologically sort graph and hash it to create a version hash).
   But for MVP we definitely don't need versioning - users must take care of
   this on their own by just creating new flows if they change the shape of
   the flow. There is no way and will be no way to UPDATE flows.

   Graph shape should be immutable after creation, but i'm not sure about
   the options - maybe it would be a good idea to allow updating retry configs,
   because only running the flows in production can allow users to gather
   enough data to make educated decisions about those params.

10. No modification for flows/steps at all, so easy.
    
:::
