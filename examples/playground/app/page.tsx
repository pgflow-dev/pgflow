import Hero from '@/components/hero';
import WebsiteAnalyzerForm from '@/components/website-analyzer-form';
import AuthRedirectHandler from '@/components/auth-redirect-handler';
import { createClient } from '@/utils/supabase/server';
import ExampleLinks from '@/components/example-links';

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
              it then use AI to summarize it and extract tags.
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
              <ExampleLinks isLoggedIn={isLoggedIn} />
            </div>
          </div>
        </div>
      </main>
      {/* This component handles redirects after login with pending analysis */}
      <AuthRedirectHandler />
    </>
  );
}
