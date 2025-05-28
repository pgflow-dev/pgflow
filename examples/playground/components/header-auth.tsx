'use client'

import { signOutAction } from "@/app/actions";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { SpinnerWrapper } from "./spinner-wrapper";
import { useEffect, useState } from "react";

export default function AuthButton() {
  const [user, setUser] = useState<any | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    // Initial auth check
    supabase.auth.getUser().then(({ data, error }) => {
      console.log('Auth check - user:', data.user);
      console.log('Auth check - error:', error);
      setUser(data.user ?? null);
      setChecking(false);
    });
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session?.user);
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
        <div 
          className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium"
          title={user.email}
        >
          {user.email?.charAt(0).toUpperCase()}
        </div>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant={"outline"} title={user.email}>
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
