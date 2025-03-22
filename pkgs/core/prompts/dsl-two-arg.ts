const ScrapeWebsiteFlow = new Flow<Input>()
  .step(
    {
      slug: 'verify_status',
    },
    async (payload) => {
      // Placeholder function
      return { status: 'success' };
    }
  )
  .step(
    {
      slug: 'when_success',
      dependsOn: ['verify_status'],
      runIf: { verify_status: { status: 'success' } },
    },
    async (payload) => {
      // Placeholder function
      return await scrapeSubpages(
        payload.run.url,
        payload.table_of_contents.urls_of_subpages
      );
    }
  )
  .step(
    {
      slug: 'when_server_error',
      dependsOn: ['verify_status'],
      runUnless: { verify_status: { status: 'success' } },
    },
    async (payload) => {
      // Placeholder function
      return await generateSummaries(payload.subpages.contentsOfSubpages);
    }
  )
  .step(
    {
      slug: 'sentiments',
      dependsOn: ['subpages'],
      maxAttempts: 5,
      baseDelay: 10,
    },
    async (payload) => {
      // Placeholder function
      return await analyzeSentiments(payload.subpages.contentsOfSubpages);
    }
  )
  .step(
    {
      slug: 'save_to_db',
      dependsOn: ['subpages', 'summaries', 'sentiments'],
    },
    async (payload) => {
      // Placeholder function
      return await saveToDb(
        payload.subpages,
        payload.summaries,
        payload.sentiments
      );
    }
  );
