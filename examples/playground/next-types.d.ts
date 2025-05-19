import { ReactNode } from 'react';

// Override Next.js's internal PageProps interface to make params accept regular objects
declare module 'next' {
  interface PageProps {
    params?: any;
    searchParams?: any;
  }
}

export {};