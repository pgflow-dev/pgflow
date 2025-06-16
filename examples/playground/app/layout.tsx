import { EnvVarWarning } from '@/components/env-var-warning';
import HeaderAuth from '@/components/header-auth';
import { LoadingStateProvider } from '@/components/loading-state-provider';
import { FlowRunStoreProvider } from '@/components/flow-run-store-provider';
import { MobileLinks } from '@/components/mobile-links';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import { Geist } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import Link from 'next/link';
import {
  BookOpen,
  Github,
  AlertCircle,
  Twitter,
  MessagesSquare,
} from 'lucide-react';
import './globals.css';
import PlausibleProvider from 'next-plausible';

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'pgflow - Analyze Website Demo',
  description: 'Place to test and understand how pgflow works',
};

const geistSans = Geist({
  display: 'swap',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <PlausibleProvider domain="pgflow-demo.netlify.app">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <LoadingStateProvider>
              <FlowRunStoreProvider>
                <main className="min-h-screen flex flex-col items-center relative">
                  <div className="flex-1 w-full flex flex-col items-center">
                    <nav className="w-full flex justify-center border-b border-b-foreground/10 h-14">
                    <div className="w-full max-w-5xl flex justify-between items-center p-1 px-5 text-sm">
                      <div className="flex gap-5 items-center">
                        <Link href={'/'} className="font-semibold">
                          {metadata.title}
                        </Link>
                        <div className="hidden sm:flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-4">
                            <a
                              href="https://pgflow.dev"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <BookOpen className="h-3 w-3" />
                              Docs
                            </a>
                            <a
                              href="https://github.com/pgflow-dev/pgflow/tree/main/examples/playground/supabase/functions"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <Github className="h-3 w-3" />
                              Source
                            </a>
                            <a
                              href="https://github.com/pgflow-dev/pgflow/issues/new"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <AlertCircle className="h-3 w-3" />
                              Report Bug
                            </a>
                          </div>
                          <div className="h-3 w-[1px] bg-border"></div>
                          <div className="flex items-center gap-4">
                            <a
                              href="https://x.com/pgflow_dev"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <Twitter className="h-3 w-3" />
                              Twitter
                            </a>
                            <a
                              href="https://discord.gg/NpffdEyb"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <MessagesSquare className="h-3 w-3" />
                              Discord
                            </a>
                          </div>
                        </div>
                        <MobileLinks />
                      </div>
                      <div className="flex items-center space-x-2">
                        {!hasEnvVars ? <EnvVarWarning /> : <HeaderAuth />}
                      </div>
                    </div>
                  </nav>
                  <div className="flex flex-col max-w-5xl p-3 pt-0 w-full flex-1 pb-20">
                    {children}
                  </div>

                  <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-4 fixed bottom-0 bg-background/95 backdrop-blur-sm z-50">
                    <p>
                      Powered by{' '}
                      <a
                        href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
                        target="_blank"
                        className="font-bold hover:underline"
                        rel="noreferrer"
                      >
                        Supabase
                      </a>{' '}
                      and{' '}
                      <a
                        href="https://pgflow.dev/?utm_source=pgflow-demo"
                        target="_blank"
                        className="font-bold hover:underline"
                        rel="noreferrer"
                      >
                        pgflow
                      </a>
                    </p>
                    <ThemeSwitcher />
                  </footer>
                </div>
              </main>
            </FlowRunStoreProvider>
            </LoadingStateProvider>
          </ThemeProvider>
        </PlausibleProvider>
      </body>
    </html>
  );
}
