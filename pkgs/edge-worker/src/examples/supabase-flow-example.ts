/**
 * Example showing the new Supabase preset Flow with full autocomplete
 */
import { Flow } from '@pgflow/dsl/supabase';
import { EdgeWorker } from '../EdgeWorker.js';

// Using the Supabase preset, handlers automatically have access to all resources
const myFlow = new Flow({ slug: 'supabase_example' })
  .step({ slug: 'query_users' }, async (_input, ctx) => {
    // Full autocomplete! No need to type ctx
    const users = await ctx.sql`SELECT * FROM users WHERE active = true`;
    return { users };
  })
  .step({ slug: 'notify_admin' }, async (input, ctx) => {
    // All Supabase resources available
    const { data: _data, error } = await ctx.serviceSupabase
      .from('admin_notifications')
      .insert({ 
        message: `Found ${input.query_users.users.length} active users`,
        timestamp: new Date().toISOString()
      });
    
    if (error) throw error;
    return { notified: true };
  })
  .step({ slug: 'public_update' }, async (input, ctx) => {
    // Can use anon client for public operations
    const { data: _data } = await ctx.anonSupabase
      .from('public_stats')
      .update({ last_user_count: input.query_users.users.length })
      .eq('id', 1);
    
    // Also have access to env and shutdownSignal
    console.log('Running in environment:', ctx.env.NODE_ENV);
    
    return { updated: true };
  });

// EdgeWorker.start validates that all required resources are available
EdgeWorker.start(myFlow);