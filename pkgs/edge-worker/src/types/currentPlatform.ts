/**
 * Current platform configuration for pgflow edge workers.
 * 
 * For MVP, we only support Supabase platform. In the future, this can be 
 * made configurable or determined by build-time configuration.
 */

import type { SupabaseResources } from '../core/context.js';
import type { Context } from '@pgflow/dsl';

/**
 * The resources provided by the current platform.
 * This is hardcoded to Supabase for MVP but can be made configurable later.
 */
export type CurrentPlatformResources = SupabaseResources;

/**
 * All resources available to flows (base context + platform resources)
 */
export type AvailableResources = Context & CurrentPlatformResources;