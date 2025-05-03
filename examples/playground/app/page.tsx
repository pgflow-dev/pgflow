import Hero from '@/components/hero';
import WebsiteAnalyzerForm from '@/components/website-analyzer-form';
import AuthRedirectHandler from '@/components/auth-redirect-handler';
import { createClient } from '@/utils/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <>
      <main className="flex-1 flex flex-col gap-6 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <WebsiteAnalyzerForm isLoggedIn={isLoggedIn} />
          <div>
            <h2 className="text-2xl font-medium mb-4">How it works</h2>
            <p className="text-foreground/80">
              Enter a URL in the form to analyze a website. Our tool will scrape
              it then use AI to summarize it and extract tags and sentiment.
            </p>
            {!isLoggedIn && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-yellow-800">
                  You'll need to sign in to analyze websites. When you click the
                  button, you'll be redirected to the sign-in page.
                </p>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">
                Example Websites to Analyze
              </h3>
              <div className="flex flex-wrap gap-4">
                <a
                  href="/websites?url=https://reddit.com/r/supabase"
                  className="inline-flex px-3 py-2 bg-green-100 text-green-800 hover:bg-green-200 rounded-md text-sm font-medium"
                >
                  reddit.com/r/supabase
                </a>
                <a
                  href="/websites?url=https://supabase.com/docs"
                  className="inline-flex px-3 py-2 bg-green-100 text-green-800 hover:bg-green-200 rounded-md text-sm font-medium"
                >
                  supabase.com/docs
                </a>
                <a
                  href="/websites?url=https://pgflow.dev"
                  className="inline-flex px-3 py-2 bg-green-100 text-green-800 hover:bg-green-200 rounded-md text-sm font-medium"
                >
                  pgflow.dev
                </a>
                <a
                  href="/websites?url=https://firebase.google.com/"
                  className="inline-flex px-3 py-2 bg-red-100 text-red-800 hover:bg-red-200 rounded-md text-sm font-medium"
                >
                  Demo Failure
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* This component handles redirects after login with pending analysis */}
      <AuthRedirectHandler />
    </>
  );
}
