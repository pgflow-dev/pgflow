import { useEffect, useRef, useCallback } from 'react';

// Format relative time in a concise way (e.g., "3s ago", "5m ago")
function formatRelativeTime(
  date: Date | null,
  now: Date = new Date(),
): string {
  if (!date) return '';

  const then = date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  // Handle case where time difference is negative (server/client time mismatch)
  if (diffSec < 1) {
    return '0s';
  }

  if (diffSec < 60) {
    return `${diffSec}s`;
  }

  const minutes = Math.floor(diffSec / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Hook that returns a ref callback to attach to elements that need elapsed time updates.
 * This avoids re-rendering the entire component tree when the timer ticks.
 */
export function useElapsedTime(startDate: Date | null) {
  const elementRefs = useRef<Set<HTMLElement>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout>();

  // Update all registered elements with the current elapsed time
  const updateElements = useCallback(() => {
    if (!startDate) return;
    
    const now = new Date();
    const timeString = `${formatRelativeTime(startDate, now)} ago`;
    
    elementRefs.current.forEach(element => {
      if (element.textContent !== timeString) {
        element.textContent = timeString;
      }
    });
  }, [startDate]);

  // Ref callback to register/unregister elements
  const refCallback = useCallback((element: HTMLElement | null) => {
    if (element) {
      elementRefs.current.add(element);
      // Update immediately when element is registered
      if (startDate) {
        const now = new Date();
        element.textContent = `${formatRelativeTime(startDate, now)} ago`;
      }
    } else {
      // Element is being unmounted, remove from set
      elementRefs.current.forEach(el => {
        if (!document.contains(el)) {
          elementRefs.current.delete(el);
        }
      });
    }
  }, [startDate]);

  useEffect(() => {
    if (!startDate) return;

    // Update immediately
    updateElements();

    // Set up interval to update every second
    intervalRef.current = setInterval(updateElements, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startDate, updateElements]);

  return refCallback;
}