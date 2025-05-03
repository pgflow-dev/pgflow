'use client';

import { signInAction } from '@/app/actions';
import { FormMessage, Message } from '@/components/form-message';
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
  const router = useRouter();

  // After successful login, redirect to home page
  // The AuthRedirectHandler on the home page will handle the pending analysis
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
    <form className="flex flex-col min-w-64 max-w-64 mx-auto">
      <h1 className="text-2xl font-medium">Sign in</h1>
      <p className="text-sm text-foreground">
        Don't have an account?{' '}
        <Link className="text-foreground font-medium underline" href="/sign-up">
          Sign up
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
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
        />
        <SubmitButton pendingText="Signing In..." formAction={signInAction}>
          Sign in
        </SubmitButton>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
