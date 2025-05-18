'use client';

import { Badge } from '@/components/ui/badge';

interface AnalysisResultProps {
  summary: string | null;
  tags: string[] | null;
  websiteUrl: string;
}

/**
 * AnalysisResult component with completely fixed layout structure.
 * 
 * This component renders tags and summary sections in a fixed order,
 * regardless of when data arrives. The layout is fixed and won't change
 * even if the data updates dynamically.
 */
export default function AnalysisResult({ summary, tags, websiteUrl }: AnalysisResultProps) {
  return (
    <div className="mb-4 analysis-result">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-xl font-medium">Analysis Results</h3>
      </div>
      
      {/* Website URL display */}
      <div className="flex items-center mb-6">
        <span className="text-sm font-medium text-muted-foreground">
          Website:
        </span>
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-primary hover:underline overflow-hidden"
        >
          {websiteUrl.length > 30
            ? `${websiteUrl.substring(0, 30)}...`
            : websiteUrl}
        </a>
      </div>

      {/* Fixed structure with CSS grid - layout won't change regardless of data updates */}
      <div className="analysis-sections grid grid-rows-[auto_auto] gap-6">
        {/* 
          TAGS SECTION - Always first in the DOM 
          This will always render in position 1 regardless of data changes
        */}
        <section className="tags-section" style={{ gridRow: 1 }}>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Tags
          </h4>
          <div className="flex flex-wrap gap-2">
            {tags && tags.length > 0 ? (
              tags
                .sort((a, b) => a.localeCompare(b))
                .map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs"
                  >
                    {tag}
                  </Badge>
                ))
            ) : (
              <span className="text-sm text-muted-foreground">
                {tags === null ? "Loading tags..." : "No tags available"}
              </span>
            )}
          </div>
        </section>
        
        {/* 
          SUMMARY SECTION - Always second in the DOM
          This will always render in position 2 regardless of data changes
        */}
        <section className="summary-section" style={{ gridRow: 2 }}>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Summary
          </h4>
          <div className="text-foreground/90 whitespace-pre-line leading-relaxed">
            {summary || (summary === null ? "Loading summary..." : "No summary available")}
          </div>
        </section>
      </div>
      
      {/* 
        Additional CSS safeguards - even if the grid-row doesn't work for some reason,
        these explicit order properties will ensure correct positioning
      */}
      <style jsx>{`
        .tags-section {
          order: 1 !important;
        }
        .summary-section {
          order: 2 !important;
        }
      `}</style>
    </div>
  );
}