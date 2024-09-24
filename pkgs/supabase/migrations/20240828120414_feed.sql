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
    embedding public.vector(1536),
    inferred jsonb default '{}',
    created_at timestamp not null default current_timestamp
);

--- realtime
alter publication supabase_realtime add table feed.notes;

----------------------------- match_notes -------------------------
create or replace function match_notes(query_embedding public.vector(1536), match_threshold float)
returns table(id int, content text, similarity float, metadata jsonb) as $$
begin
    return query
    select id, content, inferred, (embedding <=> query_embedding) as similarity, jsonb_build_object('created_at', created_at) as metadata
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

create or replace function "feed"."edge_fn"(fn_name text, body text)
returns text
language plpgsql
as $$
declare
    result text;
    url text = 'http://host.docker.internal:54321/functions/v1/' || fn_name;
begin
    select content into result
    from extensions.http_post(url, body, 'application/json')
    where status >= 200 and status < 300;

    if result is null then
        raise exception 'Edge function returned non-OK status';
    end if;

    return result;
end;
$$;

create or replace function "feed"."embed_content"(input text)
returns public.vector(1536) as $$
begin
return feed.edge_fn('embed', json_build_object('input', input)::text)::public.vector(1536);
end;
$$ language plpgsql;

create or replace function "feed"."infer_metadata"(input text)
returns jsonb as $$
begin
return feed.edge_fn('infer-metadata', json_build_object('input', input)::text)::jsonb;
end;
$$ language plpgsql;

--------------------------------------- easy match notes -----------------
create or replace function easy_match_notes(query text, match_threshold float)
returns table(id int, content text, inferred jsonb, similarity float, metadata jsonb) as $$
declare
    query_embedding public.vector(1536) = feed.embed_content(query);
begin
    return query
    select
        n.id,
        n.content,
        n.inferred,
        (n.embedding <=> query_embedding) as similarity,
        jsonb_build_object('created_at', n.created_at) as metadata
    from feed.notes n
    where n.embedding is not null and (n.embedding <=> query_embedding) <= match_threshold
    order by similarity asc;
end;
$$ language plpgsql;

---------------- trigger to mark changed content for re-embedding ----------------
drop trigger if exists "mark_note_changed" on "feed"."notes";
drop function if exists "feed"."mark_note_changed";
create function "feed"."mark_note_changed"()
returns trigger
language plpgsql
as $$
begin
    IF NEW.content <> OLD.content THEN
        NEW.embedding = NULL;
        NEW.inferred = '{}';
    END IF;

    RETURN NEW;
end;
$$;

-- Create trigger for mark_note_changed
create trigger "mark_note_changed" before update
on "feed"."notes" for each row
execute function "feed"."mark_note_changed"();

create procedure feed.update_stuff(num numeric)
language plpgsql
as $$
begin
    UPDATE feed.notes
    SET embedding = feed.embed_content(content)
    WHERE feed.notes.id IN (
        SELECT id
        FROM feed.notes
        WHERE embedding IS NULL
        order by id asc
        limit num
        FOR UPDATE SKIP LOCKED
    );

    UPDATE feed.notes
    SET inferred = feed.infer_metadata(content)
    WHERE feed.notes.id IN (
        SELECT id
        FROM feed.notes
        WHERE inferred = '{}'
        order by id asc
        limit num
        FOR UPDATE SKIP LOCKED
    );
end;
$$;

----------------------------------------------------------
----- generate 10 jobs, each processing one item ---------
----- this is because 1s is the lowest granularity -------
----- and we want to trigger realtime updates often, -----
----- so we need to commit often -------------------------
----------------------------------------------------------
select cron.schedule (
    'update-stuff-' || index,
    '1 seconds',
    $$
    call feed.update_stuff(1);
    $$
)
from generate_series(1, 4) as index;

