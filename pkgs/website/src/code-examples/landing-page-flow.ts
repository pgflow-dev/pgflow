const AnalyzeWebsite = new Flow<{ url: string }>({
  slug: 'analyze_website',
})
  .step({ slug: 'scrape' }, (input) => fetchWebsite(input.run))
  .step({ slug: 'analyze', dependsOn: ['scrape'] }, (input) => {
    return {
      url: input.run.url
      summary: summarizeContent(input.scrape),
      sentiment: analyzeSentiment(input.scrape),
    };
  });
