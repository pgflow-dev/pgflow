create extension if not exists "uuid-ossp";
create extension if not exists vector;
create schema private;

create table private.chunks (
  id serial primary key,
  stored_at timestamp with time zone NOT NULL DEFAULT now(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  source_type text not null,
  content text not null,
  embedding vector(768)
);

create policy "Authenticated users can create documents"
on private.documents for insert to authenticated with check (
  owner_id = auth.uid()
);

create policy "Users can select documents"
on private.documents for select to authenticated using (
  owner_id = auth.uid()
);

create policy "Users can update documents"
on private.documents for update to authenticated with check (
  owner_id = auth.uid()
);

create policy "Users can delete documents"
on private.documents for delete to authenticated using (
  owner_id = auth.uid()
);
