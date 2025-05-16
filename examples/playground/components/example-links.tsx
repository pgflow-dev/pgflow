'use client';

import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { exampleLinks } from '@/lib/example-links';
import { useLoadingState } from './loading-state-provider';

export default function ExampleLinks() {
  const { start, isPending, error: startError } = useStartAnalysis();
  const { setLoading } = useLoadingState();

  // Function to handle example link clicks
  const handleExampleClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    if (isPending) return;
    
    // Set global loading state to true
    setLoading(true);
    
    // Start analysis will handle auth check and redirect
    start(url);
  };

  return (
    <div className="flex flex-wrap gap-4">
      {exampleLinks.map((link) => (
        <a
          key={link.url}
          onClick={(e) => handleExampleClick(e, link.url)}
          href="#"
          className={`inline-flex px-3 py-2 ${
            link.variant === 'success'
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-red-100 text-red-800 hover:bg-red-200'
          } rounded-md text-sm font-medium ${
            isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
          aria-disabled={isPending}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}