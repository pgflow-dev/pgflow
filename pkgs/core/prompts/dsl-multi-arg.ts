const ScrapeWebsiteFlow = new Flow<Input>()
  .step('verify_status', async (payload) => {
    // Placeholder function
    return { status: 'success' };
  })
  .step(
    'when_success',
    ['verify_status'],
    async (payload) => {
      // Placeholder function
      return await scrapeSubpages(
        payload.run.url,
        payload.table_of_contents.urls_of_subpages
      );
    },
    { runIf: { verify_status: { status: 'success' } } }
  )
  .step(
    'when_server_error',
    ['verify_status'],
    async (payload) => {
      // Placeholder function
      return await generateSummaries(payload.subpages.contentsOfSubpages);
    },
    { runUnless: { verify_status: { status: 'success' } } }
  )

  .step(
    'sentiments',
    ['subpages'],
    async (payload) => {
      // Placeholder function
      return await analyzeSentiments(payload.subpages.contentsOfSubpages);
    },
    { maxAttempts: 5, baseDelay: 10 }
  )
  .step(
    'save_to_db',
    ['subpages', 'summaries', 'sentiments'],
    async (payload) => {
      // Placeholder function
      return await saveToDb(
        payload.subpages,
        payload.summaries,
        payload.sentiments
      );
    }
  );
