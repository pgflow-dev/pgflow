import WebsiteAnalyzerForm from '@/components/website-analyzer-form';
import AuthRedirectHandler from '@/components/auth-redirect-handler';
import ExampleLinks from '@/components/example-links';

export const runtime = 'edge';

export default function Home() {

  return (
    <>
      <main className="flex-1 flex flex-col gap-6 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <WebsiteAnalyzerForm />
          <div>
            <h2 className="text-2xl font-medium mb-4">How it works</h2>
            <p className="text-foreground/80">
              Enter a URL in the form to analyze a website. Our tool will scrape
              it then use AI to summarize it and extract tags.
            </p>

            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">
                Example Websites to Analyze
              </h3>
              <ExampleLinks />
            </div>
          </div>
        </div>
      </main>
      {/* This component handles redirects after login with pending analysis */}
      <AuthRedirectHandler />
    </>
  );
}
