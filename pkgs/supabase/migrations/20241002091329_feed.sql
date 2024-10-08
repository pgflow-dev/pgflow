create schema if not exists feed;
grant usage on schema feed to anon, authenticated, service_role;
grant all on all tables in schema feed to anon, authenticated, service_role;
grant all on all routines in schema feed to anon, authenticated, service_role;
grant all on all sequences in schema feed to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed
grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed
grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema feed
grant all on sequences to anon, authenticated, service_role;

set search_path to feed;

----------------------------- shares -------------------------------
create table if not exists shares (
    id serial primary key,
    content text not null,
    embedding extensions.vector(1536),
    inferred jsonb default '{}',
    created_at timestamp not null default current_timestamp
);

------------------------------- RLS -------------------------------
alter table shares enable row level security;
create policy allow_select on shares for select to authenticated using (true);
create policy allow_insert on shares
for insert to authenticated with check (true);
create policy allow_update on shares
for update to authenticated using (true) with check (true);
create policy allow_delete on shares for delete to authenticated using (true);

--- realtime
alter publication supabase_realtime add table feed.shares;

----------------------------- match_shares -------------------------
create or replace function match_shares(
    query_embedding extensions.vector(1536), match_threshold float
)
returns table (id int, content text, similarity float, metadata jsonb) as $$
begin
    return query
    select id, content, inferred, (embedding <=> query_embedding) as similarity, jsonb_build_object('created_at', created_at) as metadata
    from shares
    where embedding is not null and (embedding <=> query_embedding) <= match_threshold
    order by similarity asc;
end;
$$ language plpgsql;

--------------------------------------- easy match shares -----------------
create or replace function easy_match_shares(query text, match_threshold float)
returns table (
    id int, content text, inferred jsonb, similarity float, metadata jsonb
) as $$
declare
    query_embedding extensions.vector(1536) = utils.embed(query);
begin
    return query
    select * from match_shares(query_embedding, match_threshold);
end;
$$ language plpgsql;

------------------------------------- inference --------------------------
create or replace function feed.infer_metadata(input text)
returns jsonb as $$
begin
return utils.edge_fn('infer-metadata', json_build_object('input', input)::text)::jsonb;
end;
$$ language plpgsql;

-------------- trigger to mark changed content for re-embedding ----------------
drop trigger if exists mark_share_changed on feed.shares;
drop function if exists feed.mark_share_changed;
create function feed.mark_share_changed()
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

-- Create trigger for mark_share_changed
create trigger mark_share_changed before update
on feed.shares for each row
execute function feed.mark_share_changed();

create procedure feed.update_stuff(num numeric)
language plpgsql
as $$
begin
    UPDATE feed.shares
    SET embedding = utils.embed(content)
    WHERE feed.shares.id IN (
        SELECT id
        FROM feed.shares
        WHERE embedding IS NULL
        order by id asc
        limit num
        FOR UPDATE SKIP LOCKED
    );

    UPDATE feed.shares
    SET inferred = feed.infer_metadata(content)
    WHERE feed.shares.id IN (
        SELECT id
        FROM feed.shares
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
-- select
--     cron.schedule(
--         'update-stuff-' || i,
--         '1 seconds',
--         $$
--     call feed.update_stuff(1);
--     $$
--     )
-- from generate_series(1, 4) as i;
