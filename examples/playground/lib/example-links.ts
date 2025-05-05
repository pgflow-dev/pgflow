/**
 * Common example links for website analysis and flow simulation
 */

import { StepConfig } from '../supabase/functions/_flows/simulate_flow';

// Define supported flow types
export type FlowType = 'analyze_website' | 'simulate_flow';

// Define simulation configuration format for simulate_flow
export type SimulationConfig = {
  website?: StepConfig;
  sentiment?: StepConfig;
  summary?: StepConfig;
  tags?: StepConfig;
  saveToDb?: StepConfig;
};

export interface ExampleLink {
  url: string;
  label: string;
  variant: 'success' | 'failure';
  flowType?: FlowType;
  simulationConfig?: SimulationConfig;
}

export const exampleLinks: ExampleLink[] = [
  {
    url: 'https://en.wikipedia.org/wiki/PostgreSQL',
    label: 'PostgreSQL Wikipedia',
    variant: 'success',
    flowType: 'analyze_website',
  },
  {
    url: 'https://supabase.com/docs',
    label: 'Supabase Docs',
    variant: 'success',
    flowType: 'analyze_website',
  },
  {
    url: 'https://pgflow.dev',
    label: 'pgflow.dev',
    variant: 'success',
    flowType: 'analyze_website',
  },
  {
    url: 'https://firebase.google.com/',
    label: '100% failure',
    variant: 'failure',
    flowType: 'analyze_website',
  },
  {
    url: 'https://example.com/simulation-1',
    label: 'Simulation (low failure)',
    variant: 'success',
    flowType: 'simulate_flow',
    simulationConfig: {
      website: { sleep: 1000, failureChance: 0 },
      sentiment: { sleep: 1500, failureChance: 10 },
      summary: { sleep: 2000, failureChance: 0 },
      tags: { sleep: 1200, failureChance: 5 },
      saveToDb: { sleep: 500, failureChance: 0 },
    },
  },
  {
    url: 'https://example.com/simulation-2',
    label: 'Simulation (high failure)',
    variant: 'failure',
    flowType: 'simulate_flow',
    simulationConfig: {
      website: { sleep: 500, failureChance: 30 },
      sentiment: { sleep: 1000, failureChance: 50 },
      summary: { sleep: 1500, failureChance: 40 },
      tags: { sleep: 800, failureChance: 60 },
      saveToDb: { sleep: 500, failureChance: 20 },
    },
  },
];
