'use client';
export const runtime = 'edge';

import { signInAction } from '@/app/actions';
import { FormMessage, Message } from '@/components/form-message';
import { GithubButton } from '@/components/github-button';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Login({
  searchParams,
}: {
  searchParams: Promise<Message>;
}) {
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // After successful login, redirect to home page
  useEffect(() => {
    // Process the searchParams Promise when component mounts
    const processSearchParams = async () => {
      try {
        const resolvedParams = await searchParams;
        setMessage(resolvedParams);
      } catch (error) {
        console.error('Error processing searchParams:', error);
      }
    };

    processSearchParams();

    const checkAuth = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // If user is logged in and we're on the sign-in page, redirect to home
      if (
        user &&
        typeof window !== 'undefined' &&
        window.location.pathname === '/sign-in'
      ) {
        router.push('/');
      }
    };

    checkAuth();
  }, [router, searchParams]);

  return (
    <form className="flex flex-col min-w-64 max-w-64 mx-auto" onSubmit={(e) => {
      e.preventDefault();
      setIsLoading(true);
    }}>
      <h1 className="text-2xl font-medium">Sign in</h1>
      <p className="text-sm text-foreground">
        Don't have an account?{' '}
        <Link className="text-foreground font-medium underline" href="/sign-up">
          Sign up
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <GithubButton 
          onLoadingChange={setIsLoading} 
          disabled={isLoading}
          className="h-12 text-base"
        />
        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-muted"></div>
          <span className="flex-shrink mx-4 text-muted-foreground text-sm">Or continue with email</span>
          <div className="flex-grow border-t border-muted"></div>
        </div>
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required disabled={isLoading} />
        <div className="flex justify-between items-center">
          <Label htmlFor="password">Password</Label>
          <Link
            className="text-xs text-foreground underline"
            href="/forgot-password"
          >
            Forgot Password?
          </Link>
        </div>
        <Input
          type="password"
          name="password"
          placeholder="Your password"
          required
          disabled={isLoading}
        />
        <SubmitButton 
          pendingText="Signing In..." 
          formAction={signInAction}
          disabled={isLoading}
        >
          Sign in with email
        </SubmitButton>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
