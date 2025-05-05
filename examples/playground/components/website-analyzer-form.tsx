'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { createClient } from '@/utils/supabase/client';
import { FlowType, SimulationConfig, exampleLinks } from '@/lib/example-links';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export default function WebsiteAnalyzerForm({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string>('https://example.com');
  const [selectedFlowType, setSelectedFlowType] = useState<FlowType>('analyze_website');
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig | undefined>(undefined);
  const router = useRouter();
  const supabase = createClient();

  // When selecting a link from dropdown, update flowType and simulationConfig
  const handleExampleLinkSelect = (link: typeof exampleLinks[0]) => {
    setUrl(link.url);
    setSelectedFlowType(link.flowType || 'analyze_website');
    setSimulationConfig(link.simulationConfig);
  };

  async function handleAnalyzeWebsite(formData: FormData) {
    const submittedUrl = formData.get('url') as string;

    if (!submittedUrl) {
      setFormError('Please enter a URL');
      return;
    }

    // If user is not logged in, redirect to sign-in page
    if (!isLoggedIn) {
      console.log(
        'User not logged in, storing URL and redirecting to sign-in:',
        submittedUrl,
      );
      // Store the URL in localStorage to redirect back after login
      localStorage.setItem('pendingAnalysisUrl', submittedUrl);
      router.push('/sign-in');
      return;
    }

    try {
      console.log(`Starting ${selectedFlowType} for URL:`, submittedUrl);
      // Start the transition to show loading state
      startTransition(async () => {
        let data, error;

        // Select the appropriate RPC based on flow type
        if (selectedFlowType === 'simulate_flow') {
          ({ data, error } = await supabase.rpc('start_simulate_flow', {
            url: submittedUrl,
            simulation_config: simulationConfig,
          }));
        } else {
          ({ data, error } = await supabase.rpc('start_analyze_website_flow', {
            url: submittedUrl,
          }));
        }

        if (error) {
          console.error('Error starting flow:', error);
          setFormError(error.message);
          return;
        }

        if (data && data.run_id) {
          console.log(
            'Flow started, redirecting to:',
            `/websites/runs/${data.run_id}`,
          );
          router.push(`/websites/runs/${data.run_id}`);
        } else {
          console.error('No run_id returned from flow');
          setFormError('Failed to start flow analysis');
        }
      });
    } catch (error) {
      setFormError('An error occurred while starting the flow');
      console.error('Exception during flow execution:', error);
    }
  }

  return (
    <div className="flex flex-col w-full p-4 gap-4 border rounded-lg shadow-sm">
      <h2 className="text-2xl font-medium">Analyze a Website</h2>
      <p className="text-sm text-foreground/60">
        Enter a URL to analyze a website
        {!isLoggedIn && " (you'll need to sign in first)"}
      </p>
      <form action={handleAnalyzeWebsite} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="url">Website URL</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Example Links</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exampleLinks.map((link, i) => (
                  <DropdownMenuItem key={i} onClick={() => handleExampleLinkSelect(link)}>
                    {link.label} {link.flowType === 'simulate_flow' ? '(Simulation)' : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Input
            type="url"
            name="url"
            id="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={isPending}
          />
        </div>
        <div>
          <Label htmlFor="flowType">Flow Type</Label>
          <div className="flex space-x-2 mt-1">
            <Button
              type="button"
              variant={selectedFlowType === 'analyze_website' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedFlowType('analyze_website');
                setSimulationConfig(undefined);
              }}
            >
              Real Analysis
            </Button>
            <Button
              type="button"
              variant={selectedFlowType === 'simulate_flow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedFlowType('simulate_flow');
                // Set default simulation config if none exists
                if (!simulationConfig) {
                  setSimulationConfig({
                    website: { sleep: 1000, failureChance: 10 },
                    sentiment: { sleep: 1500, failureChance: 20 },
                    summary: { sleep: 2000, failureChance: 15 },
                    tags: { sleep: 1200, failureChance: 25 },
                    saveToDb: { sleep: 500, failureChance: 5 },
                  });
                }
              }}
            >
              Simulation
            </Button>
          </div>
        </div>
        <input type="hidden" name="flowType" value={selectedFlowType} />
        {selectedFlowType === 'simulate_flow' && simulationConfig && (
          <div className="border rounded-md p-3 bg-muted/30">
            <p className="text-sm font-medium mb-2">Simulation Settings</p>
            <div className="text-xs text-muted-foreground">
              <p>Using example simulation configuration.</p>
              <p>Website step: {simulationConfig.website?.sleep}ms, {simulationConfig.website?.failureChance}% failure chance</p>
              <p>Sentiment step: {simulationConfig.sentiment?.sleep}ms, {simulationConfig.sentiment?.failureChance}% failure chance</p>
              {/* For brevity, not showing all steps */}
            </div>
          </div>
        )}
        <SubmitButton disabled={isPending} pendingText="🔄 Starting flow...">
          {isLoggedIn ? '🚀 Start Flow' : 'Sign in & Start Flow'}
        </SubmitButton>
        {formError && <FormMessage message={{ error: formError }} />}
      </form>
    </div>
  );
}
