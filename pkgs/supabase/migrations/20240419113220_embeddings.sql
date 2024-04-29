set search_path to public;

create table embeddings (
  id uuid primary key,
  content text,
  document_id uuid not null references documents(id) on delete cascade on update cascade,
  embedding vector (1536) not null,
  type text not null
);

create function match_documents_via_embeddings (
  query_embedding vector (1536),
  match_count int default 10,
  match_threshold float default 0,
  filter jsonb default '{}',
  type_filter text default null
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  embedding vector (1536),
  document_embedding vector (1536),
  embedded_content text,
  similarity float
) language plpgsql as $$
#variable_conflict use_column
begin
  return query
  select distinct
    documents.id,
    documents.content,
    documents.metadata,
    embeddings.embedding,
    documents.embedding as document_embedding,
    embeddings.content as embedded_content,
    1 - (embeddings.embedding <=> query_embedding) as similarity
  from documents
  join embeddings ON documents.id = embeddings.document_id
  where metadata @> filter
  and (type_filter is null or embeddings.type = type_filter)
  and 1 - (embeddings.embedding <=> query_embedding) >= match_threshold
  order by 1 - (embeddings.embedding <=> query_embedding) DESC
  limit match_count;
end;
$$;
