# Embedding with pgflow

```ts

import { embed } from 'ai';

new Flow<{ text: string; size: number; overlap: number }>({
  slug: 'embedText'
})
  .array({
    slug: 'chunks'
  }, ({ run: { text, size, overlap } }) => chunkText(text, { size, overlap })
  .map({ 
    slug: 'embeddings', 
    array: 'chunks',
    maxAttempts: 3
  }, (chunk, { openai }) => embed({
    value: chunk, model: openai.textEmbeddingModel("text-embedding-3-small") 
  }))
  .step({
    slug: 'save',
    dependsOn: ['chunks', 'embeddings']
  }, ({ chunks, embeddings }, { supabase }) => {
    const rowsToInsert = chunks.map((chunk, idx) => [chunk, embeddings[idx]]);

    const { data: ids } = await suapbase.from('embeddings').insert(rowsToInsert).select('id').throwOnError();

    return ids;
  });
```
