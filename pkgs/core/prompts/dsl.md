# Flow DSL

Flow DSL is used do define shape of the flow and tie functions to particular steps.

## Full flow example

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

## Explanation

This is Fluent API stype DSL but it is very simple:

1. Users create a flow by initializing a `Flow` object with a mandatory
   type annotation for the Flow `input` - this is the type of the payload
   users would start flow with and must be serializable to Json:

```ts
type Input = {
  url: string; // url of the website to scrape
};

const ScrapeWebsiteFlow = new Flow<Input>()
```

2. Then they define steps by calling `.step(stepSlug: string, depsSlugs: string[], handler: Function)` method.
   The `depsSlugs` array can be ommited if the step has no dependencies.
   This kind of steps are named "root steps" and are run first and passed only the flow input payload:

```ts
const ScrapeWebsiteFlow = new Flow<Input>()
  .step('table_of_contents', async (payload) => {
    const { run } = payload;
    // do something
    // make sure to return some value so next steps can use it
    return {
      urls_of_subpages,
      title
    }
  })
```

The `payload` object always have a special key `run` which is value passed as flow input -
every step can access and use it.

What the step handler returns is very important!
We name it `output` and it will be persisted in the the database 
and used as `input` for the dependent steps.

It must be serializable to json.

3. Then they define dependent steps by calling `.step(stepSlug: string, depsSlugs: string[], handler: Function)` method,
   now providing an array of dependencies slugs: `['table_of_contents']`.

```ts
  .step('subpages', ['table_of_contents'], async (payload) => {
    const { run, urls_of_subpages } = payload;
    // do something
    // make sure to return some value so next steps can use it
    return {
      contentsOfSubpages
    }
  })
```

Notice how the `payload` object got a new key `urls_of_subpages` - each dependency
results (the persisted return value from handler) will get passed to `payload` under the dependency slug key.

```ts
{
  run: { url: 'https://example.com' },
  table_of_contents: { 
    urls_of_subpages: ['https://example.com/subpage1', 'https://example.com/subpage2'] 
  }
}
```

4. There can be multiple steps in parallel:

```ts
.step('summaries', ['subpages'], async (payload) => await doSomeStuff())
.step('sentiments', ['subpages'], async (payload) => await doSomeStuff())
```

5. Steps can also depend on more than one other step:

```ts
.step('save_to_db', ['subpages', 'summaries', 'sentiments'], async (payload) => await saveToDb())
```

6. When run finishes, the `output`s of steps that have no dependents will be combined
   together and saved as the run's `output`. This object will be built in similar
   way as the step `input` object, but will lack the `run` key.

7. Type Safety - all the step payloads types are inferred from the combination
   of Flow input, handler inferred return type and the shape of the graph.

   So users will always know that type is their step input.
