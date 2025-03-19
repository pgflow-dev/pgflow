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
    runIf: { verify_status: { status: 'success' } },
    async handler(payload) {
      // Placeholder function
      return await scrapeSubpages(
        payload.run.url,
        payload.table_of_contents.urls_of_subpages
      );
    }
  })
  .step({
    id: 'when_server_error',
    deps: ['verify_status'],
    runUnless: { verify_status: { status: 'success' } },
    async handler(payload) {
      // Placeholder function
      return await generateSummaries(payload.subpages.contentsOfSubpages);
    }
  })
  .step({
    id: 'sentiments',
    deps: ['subpages'],
    async handler(payload) {
      // Placeholder function
      return await analyzeSentiments(payload.subpages.contentsOfSubpages);
    },
    maxAttempts: 5,
    baseDelay: 10
  })
  .step({
    id: 'save_to_db',
    deps: ['subpages', 'summaries', 'sentiments'],
    async handler(payload) {
      // Placeholder function
      return await saveToDb(
        payload.subpages,
        payload.summaries,
        payload.sentiments
      );
    },
  });
