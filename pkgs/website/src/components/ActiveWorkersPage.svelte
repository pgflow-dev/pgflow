<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { fetchWorkers } from '../libs/db';

type Worker = {
  function_name: string;
  queue_name: string;
  started_at: string;
  stopped_at: string;
  last_heartbeat_at: string;
  worker_id: string;
};

let rows: Worker[] = [];
let interval: number;

function getSecondsAgo(timestamp: string): string {
  const diff = Math.round((Date.now() - new Date(timestamp).getTime()) / 1000);
  return `${diff} seconds ago`;
}

async function refreshWorkers() {
  rows = await fetchWorkers();
}

onMount(() => {
  refreshWorkers();
  interval = setInterval(refreshWorkers, 1000);
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
