<script lang="ts">
import { onMount } from 'svelte';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from 'astro:env/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log(supabase);
let rows = [];

onMount(async () => {
  const { data, error } = await supabase.schema('edge_worker').from('active_workers').select('*');
  console.log(data);

  if (error) {
    console.log(error);
  }
  else {
    rows = data;
  }
});

</script>

<h3>Active workers: {rows.length}</h3>
