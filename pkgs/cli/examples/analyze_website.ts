import { Flow } from '@pgflow/dsl';

// Define the input type for the flow
type WebsiteAnalysisInput = {
  url: string;
  depth?: number;
};

// Create a flow with typed input
const AnalyzeWebsite = new Flow<WebsiteAnalysisInput>({
  slug: 'analyze_website',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  // First step: scrape the website
  .step({ slug: 'website' }, async (flowInput) => {
    console.log(`Scraping website: ${flowInput.url}`);
    // In a real implementation, this would call an actual web scraper
    return {
      content: `Sample content from ${flowInput.url}`,
      title: 'Sample Website Title',
      links: ['https://example.com/page1', 'https://example.com/page2'],
    };
  })
  // Second step: analyze sentiment (depends on website step)
  .step(
    {
      slug: 'sentiment',
      dependsOn: ['website'],
      timeout: 30,
      maxAttempts: 5,
    },
    async (deps) => {
      console.log(`Analyzing sentiment for: ${deps.website.title}`);
      // In a real implementation, this would call a sentiment analysis service
      return {
        score: 0.75,
        positive: true,
        keywords: ['great', 'excellent', 'recommended'],
      };
    }
  )
  // Third step: generate summary (depends on website step)
  .step({ slug: 'summary', dependsOn: ['website'] }, async (deps) => {
    console.log(`Generating summary for: ${deps.website.title}`);
    // In a real implementation, this might use an AI service
    return {
      aiSummary: `This is a summary of ${deps.website.title}`,
      wordCount: deps.website.content.split(' ').length,
    };
  })
  // Fourth step: save results to database (depends on sentiment and summary)
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    async (_deps, ctx) => {
      const flowInput = await ctx.flowInput;
      console.log(`Saving results to database for: ${flowInput.url}`);
      // In a real implementation, this would save to a database
      return {
        status: 'success',
        timestamp: new Date().toISOString(),
        recordId: `record_${Date.now()}`,
      };
    }
  );

// Export the flow as default
export default AnalyzeWebsite;
