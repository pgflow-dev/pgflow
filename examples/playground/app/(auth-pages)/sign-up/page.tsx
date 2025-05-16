'use client';
export const runtime = 'edge';

import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { GithubButton } from "@/components/github-button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState, useEffect } from 'react';

export default function Signup(props: {
  searchParams: Promise<Message>;
}) {
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const processSearchParams = async () => {
      try {
        const resolvedParams = await props.searchParams;
        setMessage(resolvedParams);
      } catch (error) {
        console.error('Error processing searchParams:', error);
      }
    };

    processSearchParams();
  }, [props.searchParams]);

  if (message && "message" in message) {
    return (
      <div className="w-full flex-1 flex items-center h-screen sm:max-w-md justify-center gap-2 p-4">
        <FormMessage message={message} />
      </div>
    );
  }

  return (
    <>
      <form className="flex flex-col min-w-64 max-w-64 mx-auto" onSubmit={() => setIsLoading(true)}>
        <h1 className="text-2xl font-medium">Sign up</h1>
        <p className="text-sm text text-foreground">
          Already have an account?{" "}
          <Link className="text-primary font-medium underline" href="/sign-in">
            Sign in
          </Link>
        </p>
        <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
          <GithubButton 
            onLoadingChange={setIsLoading} 
            disabled={isLoading}
            className="h-12 text-base"
            text="Sign up with GitHub"
          />
          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-muted"></div>
            <span className="flex-shrink mx-4 text-muted-foreground text-sm">Or sign up with email</span>
            <div className="flex-grow border-t border-muted"></div>
          </div>
          <Label htmlFor="email">Email</Label>
          <Input name="email" placeholder="you@example.com" required disabled={isLoading} />
          <Label htmlFor="password">Password</Label>
          <Input
            type="password"
            name="password"
            placeholder="Your password"
            minLength={6}
            required
            disabled={isLoading}
          />
          <SubmitButton 
            formAction={signUpAction} 
            pendingText="Signing up..."
            disabled={isLoading}
          >
            Sign up with email
          </SubmitButton>
          <FormMessage message={message} />
        </div>
      </form>
    </>
  );
}
