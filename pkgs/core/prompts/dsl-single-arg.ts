const ScrapeWebsiteFlow = new Flow<Input>()
  .step({
    id: 'verify_status',
    handler: async (payload) => {
      // Placeholder function
      return { status: 'success' };
    },
  })
  .step({
    id: 'when_success',
    deps: ['verify_status'],
    handler: async (payload) => {
      // Placeholder function
      return await scrapeSubpages(
        payload.run.url,
        payload.table_of_contents.urls_of_subpages
      );
    },
    opts: { runIf: { status: 'success' } },
  })
  .step({
    id: 'when_server_error',
    deps: ['verify_status'],
    handler: async (payload) => {
      // Placeholder function
      return await generateSummaries(payload.subpages.contentsOfSubpages);
    },
    opts: { runUnless: { status: 'success' } },
  })
  .step({
    id: 'sentiments',
    deps: ['subpages'],
    handler: async (payload) => {
      // Placeholder function
      return await analyzeSentiments(payload.subpages.contentsOfSubpages);
    },
    opts: { maxAttempts: 5, baseDelay: 10 },
  })
  .step({
    id: 'save_to_db',
    deps: ['subpages', 'summaries', 'sentiments'],
    handler: async (payload) => {
      // Placeholder function
      return await saveToDb(
        payload.subpages,
        payload.summaries,
        payload.sentiments
      );
    },
  });
