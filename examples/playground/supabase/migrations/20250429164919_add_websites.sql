create table public.websites (
  id SERIAL primary key,
  user_id UUID not null references auth.users (id),
  website_url TEXT not null,
  sentiment FLOAT not null,
  summary TEXT not null,
  tags TEXT [] not null default '{}',
  created_at TIMESTAMP WITH TIME ZONE default NOW() not null,
  updated_at TIMESTAMP WITH TIME ZONE default NOW() not null
);

create index idx_websites_website_url on public.websites (website_url);
create index idx_websites_user_id on public.websites (user_id);

-- Enable Row Level Security
alter table public.websites enable row level security;

-- Policy: Allow all users (including anonymous) to select from websites
create policy "Allow select for all users"
on public.websites
for select
to public
using (true);

-- Policy: Only owners can update their websites
create policy "Allow update for owners only"
on public.websites
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Policy: Only owners can delete their websites
create policy "Allow delete for owners only"
on public.websites
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Policy: Ensure user_id is set to the current user on insert
create policy "Allow insert with user_id set to current user"
on public.websites
for insert
to authenticated
with check ((select auth.uid()) = user_id);
