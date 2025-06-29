'use client';

import { useState } from 'react';
import { BookOpen, Github, Twitter, AlertCircle, MessagesSquare, MoreHorizontal } from 'lucide-react';

export function MobileLinks() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="sm:hidden relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1"
        aria-label="Show links"
      >
        <MoreHorizontal className="h-4 w-4" />
        Links
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-background border rounded-md shadow-md py-2 px-3 z-10 min-w-[160px]">
          <div className="space-y-1">
            <a 
              href="https://pgflow.dev" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <BookOpen className="h-4 w-4" />
              Documentation
            </a>
            <a 
              href="https://github.com/pgflow-dev/pgflow/tree/main/examples/playground/supabase/functions" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Github className="h-4 w-4" />
              Source Code
            </a>
            <a 
              href="https://github.com/pgflow-dev/pgflow/issues/new" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <AlertCircle className="h-4 w-4" />
              Report Bug
            </a>
          </div>
          
          <div className="h-[1px] w-full bg-border my-2"></div>
          
          <div className="space-y-1">
            <a 
              href="https://x.com/pgflow_dev" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Twitter className="h-4 w-4" />
              Twitter (X)
            </a>
            <a 
              href="https://pgflow.dev/discord/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <MessagesSquare className="h-4 w-4" />
              Discord Community
            </a>
          </div>
        </div>
      )}
    </div>
  );
}