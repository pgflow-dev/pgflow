create schema if not exists feed;
grant usage on schema feed to anon, authenticated, service_role;
grant all on all tables in schema feed to anon, authenticated, service_role;
grant all on all routines in schema feed to anon, authenticated, service_role;
grant all on all sequences in schema feed to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed grant all on sequences to anon, authenticated, service_role;
set search_path TO feed;

-- Grant usage on schema to public roles
grant usage on schema feed to anon, authenticated;

-- Create table 'notes' with specified columns
create table if not exists notes (
    id serial primary key,
    content text not null,
    embedding public.vector(1536),
    created_at timestamp not null default current_timestamp
);

-- Create function 'match_notes' to match notes based on similarity search
create or replace function match_notes(query_embedding public.vector(1536), match_threshold float)
returns table(id int, content text, similarity float, metadata jsonb) as $$
begin
    return query
    select id, content, (embedding <=> query_embedding) as similarity, jsonb_build_object('created_at', created_at) as metadata
    from notes
    where embedding is not null and (embedding <=> query_embedding) <= match_threshold
    order by similarity asc;
end;
$$ language plpgsql;

-- RLS
alter table notes enable row level security;
create policy "allow select" on notes for select to authenticated using (true);
create policy "allow insert" on notes for insert to authenticated with check (true);
create policy "allow update" on notes for update to authenticated using (true) with check (true);
create policy "allow delete" on notes for delete to authenticated using (true);
