/**
 * Simplified flow code for display in CodePanel
 * This is a clean, educational example matching the PRD
 * Actual implementation is in supabase/functions/article_flow_worker/
 */

interface CodeSection {
	code: string;
	mobileCode?: string; // Mobile-optimized version with line breaks
	startLine?: number;
	endLine?: number;
}

/**
 * Flow code sections by step slug
 * Each section contains the code for that part of the flow
 */
export const FLOW_SECTIONS: Record<string, CodeSection> = {
	flow_config: {
		code: `new Flow<{ url: string }>({
  slug: 'article_flow',
  maxAttempts: 3
})`
	},
	fetchArticle: {
		code: `  .step(
    { slug: 'fetchArticle' },
    (input) => scrapeUrl(input.run.url)
  )`,
		mobileCode: `  .step(
    { slug: 'fetchArticle' },
    (input) => scrapeUrl(
      input.run.url
    )
  )`
	},
	summarize: {
		code: `  .step(
    { slug: 'summarize', dependsOn: ['fetchArticle'] },
    (input) => summarize(schema, input.fetchArticle.content)
  )`,
		mobileCode: `  .step(
    {
      slug: 'summarize',
      dependsOn: ['fetchArticle']
    },
    (input) => summarize(
      schema,
      input.fetchArticle.content
    )
  )`
	},
	extractKeywords: {
		code: `  .step(
    { slug: 'extractKeywords', dependsOn: ['fetchArticle'] },
    (input) => extractKeywords(input.fetchArticle.content)
  )`,
		mobileCode: `  .step(
    {
      slug: 'extractKeywords',
      dependsOn: ['fetchArticle']
    },
    (input) => extractKeywords(
      input.fetchArticle.content
    )
  )`
	},
	publish: {
		code: `  .step(
    { slug: 'publish', dependsOn: ['summarize', 'extractKeywords'] },
    (input) => publishArticle(input.summarize, input.extractKeywords)
  );`,
		mobileCode: `  .step(
    {
      slug: 'publish',
      dependsOn: [
        'summarize',
        'extractKeywords'
      ]
    },
    (input) => publishArticle(
      input.summarize,
      input.extractKeywords
    )
  );`
	}
};

/**
 * Calculate line ranges for each section and build the full code
 */
function calculateLineRanges() {
	let currentLine = 1;
	const orderedSlugs = ['flow_config', 'fetchArticle', 'summarize', 'extractKeywords', 'publish'];

	for (const slug of orderedSlugs) {
		const section = FLOW_SECTIONS[slug];
		const lineCount = section.code.split('\n').length;

		section.startLine = currentLine;
		section.endLine = currentLine + lineCount - 1;
		currentLine += lineCount;
	}
}

// Calculate line ranges on module load
calculateLineRanges();

/**
 * Full flow code for syntax highlighting
 */
export const FLOW_CODE = Object.values(FLOW_SECTIONS)
	.map((section) => section.code)
	.join('\n');

/**
 * Get step slug from line number
 */
export function getStepFromLine(lineNumber: number): string | null {
	for (const [slug, section] of Object.entries(FLOW_SECTIONS)) {
		if (
			section.startLine !== undefined &&
			section.endLine !== undefined &&
			lineNumber >= section.startLine &&
			lineNumber <= section.endLine
		) {
			return slug;
		}
	}
	return null;
}

/**
 * Map line ranges to step slugs for backwards compatibility
 * Generated from FLOW_SECTIONS
 */
export const LINE_TO_STEP_MAP: Record<string, string> = Object.entries(FLOW_SECTIONS).reduce(
	(acc, [slug, section]) => {
		if (section.startLine !== undefined && section.endLine !== undefined) {
			acc[`${section.startLine}-${section.endLine}`] = slug;
		}
		return acc;
	},
	{} as Record<string, string>
);
