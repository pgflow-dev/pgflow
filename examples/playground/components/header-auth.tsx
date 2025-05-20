'use client'

import { signOutAction } from "@/app/actions";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { logger } from "@/utils/utils";
import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/browser-client";
import { SpinnerWrapper } from "./spinner-wrapper";
import { useEffect, useState } from "react";

export default function AuthButton() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    // Initial auth check
    supabase.auth.getUser().then(({ data, error }) => {
      logger.log('Auth check - user:', data.user);
      logger.log('Auth check - error:', error);
      setUser(data.user ?? null);
      setChecking(false);
    });
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      logger.log('Auth state changed:', _event, session?.user);
      setUser(session?.user ?? null);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  if (!hasEnvVars) {
    return (
      <>
        <div className="flex gap-4 items-center">
          <div>
            <Badge
              variant={"default"}
              className="font-normal pointer-events-none"
            >
              Please update .env.local file with anon key and url
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              asChild
              size="sm"
              variant={"outline"}
              disabled
              className="opacity-75 cursor-none pointer-events-none"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant={"default"}
              disabled
              className="opacity-75 cursor-none pointer-events-none"
            >
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }
  
  if (checking) {
    return <SpinnerWrapper />;
  }
  
  return user ? (
    <div className="flex items-center gap-4">
      <SpinnerWrapper />
      <div className="flex items-center gap-2">
        Hey, {user.email}!
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant={"outline"}>
          Sign out
        </Button>
      </form>
    </div>
  ) : (
    <div className="flex items-center gap-4">
      <SpinnerWrapper />
      <div className="flex gap-2">
        <Button asChild size="sm" variant={"outline"}>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant={"default"}>
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    </div>
  );
}
