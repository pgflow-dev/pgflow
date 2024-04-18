-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

set search_path TO public;

-- Create a table to store your documents
create table
  documents (
    id uuid primary key,
    content text, -- corresponds to Document.pageContent
    metadata jsonb, -- corresponds to Document.metadata
    embedding vector (384) -- 1536 works for OpenAI embeddings, change if needed
  );

-- Create a function to search for documents
create function match_documents (
  query_embedding vector (384),
  match_count int default 10,
  match_threshold float default 0,
  filter jsonb default '{}'
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  embedding vector (384),
  similarity float
) language plpgsql as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    embedding,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  and 1 - (documents.embedding <=> query_embedding) >= match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
