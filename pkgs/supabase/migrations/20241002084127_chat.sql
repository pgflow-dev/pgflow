create schema if not exists chat;
grant usage on schema chat to anon, authenticated, service_role;
grant all on all tables in schema chat to anon, authenticated, service_role;
grant all on all routines in schema chat to anon, authenticated, service_role;
grant all on all sequences in schema chat to anon, authenticated, service_role;
alter default privileges for role postgres in schema chat
grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema chat
grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema chat
grant all on sequences to anon, authenticated, service_role;

set search_path to chat;

----------------------------------------------------
---------------- Tables ----------------------------
----------------------------------------------------
create table conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (
        id
    ) on update cascade on delete cascade,
    title text,
    created_at timestamp with time zone not null default now()
);
create index on conversations (user_id, created_at desc);

create table messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null,
    user_id uuid not null default auth.uid() references auth.users (
        id
    ) on update cascade on delete cascade,
    created_at timestamp with time zone not null default now(),
    content text not null,

    -- TODO: add some check constraints limiting roles
    role text not null
);
create index on messages (user_id);
create index on messages (user_id, conversation_id, created_at asc);

----------------------------------------------------
---------------- Policies --------------------------
----------------------------------------------------

alter table messages enable row level security;
alter table conversations enable row level security;

-- SELECT
create policy "allow select" on conversations for select to authenticated
using (user_id = (select auth.uid()));
create policy "allow select" on messages for select to authenticated
using (user_id = (select auth.uid()));

-- INSERT
create policy "allow insert" on conversations for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "allow insert IF owner of conversation" on messages for insert to authenticated
with check (user_id = (select auth.uid()));

-- UPDATE
create policy "DENY update" on conversations for update to authenticated
using (false);
create policy "DENY update" on messages for update to authenticated
using (false);

-- DELETE
create policy "allow delete if owner" on conversations for delete to authenticated
using (user_id = (select auth.uid()));
create policy "allow delete if owner" on messages for delete to authenticated
using (user_id = (select auth.uid()));
