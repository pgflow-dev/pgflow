# Flow SDK

The purpose of Flow SDK is to allow users to start and observe flow runs in their apps
and leverage strong typing of the inputs, outputs and dependencies between steps
in order to improve Developer Experience.

Based on the Flow definition like this:

```ts
const ScrapeWebsiteFlow = new Flow<Input>()
  .step('table_of_contents', async (payload) => {
    // Placeholder function
    return await fetchTableOfContents(payload.run.url);
  })
  .step('subpages', ['table_of_contents'], async (payload) => {
    // Placeholder function
    return await scrapeSubpages(payload.run.url, payload.table_of_contents.urls_of_subpages);
  })
  .step('summaries', ['subpages'], async (payload) => {
    // Placeholder function
    return await generateSummaries(payload.subpages.contentsOfSubpages);
  })
  .step('sentiments', ['subpages'], async (payload) => {
    // Placeholder function
    return await analyzeSentiments(payload.subpages.contentsOfSubpages);
  })
  .step('save_to_db', ['subpages', 'summaries', 'sentiments'], async (payload) => {
    // Placeholder function
    return await saveToDb(payload.subpages, payload.summaries, payload.sentiments);
  });
```

We want to be able to infer the following information somehow:

- The cumulative payload types that are built step-by-step
- The relationships between steps that are established at runtime

Those are the most important things we need, so users can for example trigger 
flows and get annotations for the step results etc.
Given the example flow I would like my users to be able to get their defined flow and do things like:

```ts
import type { ScrapeWebsiteFlow } from './flows/scrape_website';
import { createClient } from '@pgflow/sdk';

const { startFlow } = createClient(supabaseClient);

const flowRun = startFlow<ScrapeWebsiteFlow>({
  url: 'https://example.com', // this is type checked based on the Input to ScrapeWebsiteFlow
});

// here, 'subpages' (the name of step) would be type checked and only existing steps
// can be used here, so user cannot await for non existing step
const subpagesOutput = flowRun.stepCompleted('subpages');

// the subpagesOutput is also type-annotated based on the return type inferred
// from the handler for 'subpages' step, only based on the ScrapeWebsiteFlow type
subpagesOutput.forEac() // this is an array because handler for 'subpages' returns an array
```
