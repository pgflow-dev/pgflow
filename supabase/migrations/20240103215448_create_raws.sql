create extension if not exists "uuid-ossp";
create extension if not exists vector;
create schema private;

create table private.raws (
  id serial primary key,
  stored_at timestamp with time zone NOT NULL DEFAULT now(),
  content text NOT NULL,
  source_type text not null,
  owner_id uuid not null references auth.users(id) default auth.uid(),
  meta jsonb default '{}'
);

create policy "Authenticated users can create raws"
on private.raws for insert to authenticated with check (
  owner_id = auth.uid()
);

create policy "Users can select raws"
on private.raws for select to authenticated with check (
  owner_id = auth.uid()
);

create policy "Users can update raws"
on private.raws for update to authenticated with check (
  owner_id = auth.uid()
);

create policy "Users can delete raws"
on private.raws for delete to authenticated with check (
  owner_id = auth.uid()
);
