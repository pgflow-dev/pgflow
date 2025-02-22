<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from 'astro:env/client';
import { createClient } from '@supabase/supabase-js';

type Worker = {
  function_name: string;
  queue_name: string;
  started_at: string;
  stopped_at: string;
  last_heartbeat_at: string;
  worker_id: string;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let rows: Worker[] = [];
let interval: number;

function getSecondsAgo(timestamp: string): string {
  const diff = Math.round((Date.now() - new Date(timestamp).getTime()) / 1000);
  return `${diff} seconds ago`;
}

async function fetchWorkers() {
  const { data, error } = await supabase.schema('edge_worker').from('active_workers').select('*').order('last_heartbeat_at', { ascending: false });
  
  if (error) {
    console.error(error);
    return;
  }
  
  rows = data;
}

onMount(() => {
  fetchWorkers();
  interval = setInterval(fetchWorkers, 1000);
});

onDestroy(() => {
  clearInterval(interval);
});
</script>

<table>
  <thead>
    <tr>
      <th>Function</th>
      <th>Queue</th>
      <th>ID</th>
      <th>Started at</th>
      <th>Last heartbeat</th>
    </tr>
  </thead>

  <tbody>
    {#each rows as row}
      <tr>
        <td>{row.function_name}</td>
        <td>{row.queue_name}</td>
        <td>{row.worker_id}</td>
        <td>{getSecondsAgo(row.started_at)}</td>
        <td>{getSecondsAgo(row.last_heartbeat_at)}</td>
      </tr>
    {/each}
  </tbody>
</table>
