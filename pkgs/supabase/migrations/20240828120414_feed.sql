----------------------------- FEED ------------------------------
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

----------------------------- notes -------------------------------
create table if not exists notes (
    id serial primary key,
    content text not null,
    embedding public.vector(384),
    created_at timestamp not null default current_timestamp
);

----------------------------- match_notes -------------------------
create or replace function match_notes(query_embedding public.vector(384), match_threshold float)
returns table(id int, content text, similarity float, metadata jsonb) as $$
begin
    return query
    select id, content, (embedding <=> query_embedding) as similarity, jsonb_build_object('created_at', created_at) as metadata
    from notes
    where embedding is not null and (embedding <=> query_embedding) <= match_threshold
    order by similarity asc;
end;
$$ language plpgsql;

------------------------------- RLS -------------------------------
alter table notes enable row level security;
create policy "allow select" on notes for select to authenticated using (true);
create policy "allow insert" on notes for insert to authenticated with check (true);
create policy "allow update" on notes for update to authenticated using (true) with check (true);
create policy "allow delete" on notes for delete to authenticated using (true);


-------------------------------- http embed fn --------------------
drop extension if exists http;
create extension http with schema extensions;

-- Create embed_content function
create or replace function "feed"."embed_content"(input text)
returns public.vector(384)
language plpgsql
as $$
declare
    result public.vector(384);
begin
    select content::public.vector(384) into result
    from extensions.http_post(
        'http://host.docker.internal:54321/functions/v1/embed',
        json_build_object('input', input)::text,
        'application/json'
    );
    return result;
end;
$$;

--------------------------------------- easy match notes -----------------
create or replace function easy_match_notes(query text, match_threshold float)
returns table(id int, content text, similarity float, metadata jsonb) as $$
declare
    query_embedding public.vector(384) = feed.embed_content(query);
begin
    return query
    select n.id, n.content, (n.embedding <=> query_embedding) as similarity, jsonb_build_object('created_at', n.created_at) as metadata
    from feed.notes n
    where n.embedding is not null and (n.embedding <=> query_embedding) <= match_threshold
    order by similarity asc;
end;
$$ language plpgsql;

---------------- trigger to mark changed content for re-embedding ----------------
drop trigger if exists "embed_notes" on "feed"."notes";
drop function if exists "feed"."embed_notes";
create function "feed"."embed_notes"()
returns trigger
language plpgsql
as $$
begin
    IF NEW.content <> OLD.content THEN
        NEW.embedding = NULL;
    END IF;

    RETURN NEW;
end;
$$;

-- Create trigger for embed_notes
create trigger "embed_notes" before update
on "feed"."notes" for each row
execute function "feed"."embed_notes"();

-----------
select cron.schedule (
    'create-missing-embeddings',
    '1 seconds',
    $$
    UPDATE feed.notes
    SET embedding = feed.embed_content(content)
    WHERE embedding IS NULL
    AND feed.notes.id IN (
        SELECT id
        FROM feed.notes
        WHERE embedding IS NULL
        FOR UPDATE SKIP LOCKED
    )
    $$
);

