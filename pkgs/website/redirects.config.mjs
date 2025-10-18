// @ts-check

/**
 * Redirect configuration for pgflow documentation
 *
 * This file maintains URL redirects to prevent broken links when documentation
 * is reorganized. All redirects are verified during build to ensure destinations exist.
 *
 * Structure:
 * - Historical redirects from old reorganizations
 * - Main branch path migrations from latest restructure
 */

export const redirects = {
  // ============================================================================
  // HISTORICAL REDIRECTS (from old redirect sources on main)
  // ============================================================================

  // Original simple redirects (still valid)
  '/hire/': '/author/',
  '/concepts/array-and-map-steps/': '/concepts/map-steps/',

  // Edge worker old paths → new deployment docs
  '/edge-worker/how-to/run-on-hosted-supabase/':
    '/deploy/supabase/deploy-first-flow/',
  '/edge-worker/faq/': '/get-started/faq/',
  '/edge-worker/how-to/': '/get-started/faq/',
  '/edge-worker/how-to/deploy-to-supabasecom/':
    '/deploy/supabase/deploy-first-flow/',
  '/edge-worker/how-to/prepare-db-string/': '/deploy/connection-string/',

  // Flow versioning redirect
  '/how-to/version-your-flows/': '/build/version-flows/',

  // Old explanations section → concepts
  '/explanations/': '/concepts/',
  '/explanations/flow-dsl/': '/concepts/understanding-flows/',
  '/explanations/comparison-to-dbos/': '/comparisons/dbos/',
  '/explanations/comparison-to-inngest/': '/comparisons/inngest/',
  '/explanations/comparison-to-trigger-dev/': '/comparisons/trigger/',

  // vs → comparisons rename (main had comparisons → vs, now reversed)
  // Note: /comparisons/* paths match current branch, so no redirects needed

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (getting-started → get-started)
  // ============================================================================

  '/getting-started/': '/get-started/installation/',
  '/getting-started/install-pgflow/': '/get-started/installation/',
  '/getting-started/create-first-flow/': '/get-started/flows/create-flow/',
  '/getting-started/compile-to-sql/': '/get-started/flows/compile-flow/',
  '/getting-started/run-flow/': '/get-started/flows/run-flow/',
  '/getting-started/configuration/': '/reference/configuration/',
  '/getting-started/update-pgflow/': '/deploy/update-pgflow/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (vs → comparisons)
  // ============================================================================

  '/vs/': '/comparisons/',
  '/vs/dbos/': '/comparisons/dbos/',
  '/vs/inngest/': '/comparisons/inngest/',
  '/vs/trigger/': '/comparisons/trigger/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (faq moved)
  // ============================================================================

  '/faq/': '/get-started/faq/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (concepts structure changes)
  // ============================================================================

  '/concepts/context/': '/concepts/context-object/',
  '/concepts/flow-dsl/': '/concepts/understanding-flows/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (how-to split to build/deploy/reference/concepts)
  // ============================================================================

  '/how-to/batch-process-with-map/': '/build/process-arrays-in-parallel/',
  '/how-to/create-reusable-tasks/': '/build/create-reusable-tasks/',
  '/how-to/delete-flow-and-data/': '/build/delete-flows/',
  '/how-to/deploy-to-supabasecom/': '/deploy/supabase/deploy-first-flow/',
  '/how-to/keep-workers-up/': '/deploy/supabase/keep-workers-running/',
  '/how-to/manual-installation/': '/reference/manual-installation/',
  '/how-to/manually-compile-flow/': '/reference/compile-api/',
  '/how-to/monitor-flow-execution/': '/deploy/monitor-execution/',
  '/how-to/naming-steps/': '/concepts/naming-steps/',
  '/how-to/organize-flows-code/': '/build/organize-flow-code/',
  '/how-to/prepare-db-string/': '/deploy/connection-string/',
  '/how-to/prune-old-records/': '/deploy/prune-records/',
  '/how-to/update-flow-options/': '/deploy/tune-flow-config/',
  '/how-to/version-flows/': '/build/version-flows/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (edge-worker split to reference/get-started/deploy)
  // ============================================================================

  '/edge-worker/getting-started/configuration/':
    '/reference/queue-worker/configuration/',
  '/edge-worker/getting-started/create-first-worker/':
    '/get-started/background-jobs/create-worker/',
  '/edge-worker/getting-started/install-edge-worker/':
    '/get-started/installation/',
  '/edge-worker/getting-started/observability/':
    '/deploy/monitor-workers-health/',
  '/edge-worker/how-it-works/': '/reference/queue-worker/how-it-works/',

  // ============================================================================
  // MAIN BRANCH PATH MIGRATIONS (news - removed article)
  // ============================================================================

  '/news/pgflow-0-3-0-fixing-race-conditions/': '/news/',
};
