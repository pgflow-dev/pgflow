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
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    content text not null,
    embedding extensions.vector(1536),
    inferred_type text,
    inferred_type_confidence numeric
    check (
        inferred_type_confidence is NULL
        or (inferred_type_confidence <= 1 and inferred_type_confidence >= 0)
    ),
    inferred jsonb default '{}',
    created_at timestamp not null default current_timestamp
);

------------------------------- RLS -------------------------------
alter table shares enable row level security;
create policy allow_select on shares for select to authenticated
using (owner_id = auth.uid());
create policy allow_insert on shares
for insert to authenticated with check (owner_id = auth.uid());
create policy allow_update on shares for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy allow_delete on shares for delete to authenticated
using (owner_id = auth.uid());

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

-------------- trigger to mark changed content for re-embedding ----------------
drop trigger if exists mark_share_changed on feed.shares;
drop function if exists feed.mark_share_changed;
create function feed.mark_share_changed()
returns trigger
language plpgsql
as $$
begin
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.content <> OLD.content) THEN
        perform utils.enqueue_job_for_row('infer_type', 'feed', 'shares', NEW.id);
    END IF;

    RETURN NEW;
end;
$$;

-- Create trigger for mark_share_changed
create trigger mark_share_changed after update or insert
on feed.shares for each row
execute function feed.mark_share_changed();
