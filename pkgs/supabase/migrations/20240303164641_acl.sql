create schema if not exists acl;

create table if not exists acl.superadmin_emails
(
  email text primary key
);

-- postgres function that checks if current signed in user's email is present in superadmin_emails table
drop function if exists public.is_superadmin();
create or replace function public.is_superadmin()
returns boolean as $$
begin
  return (
    select exists (
      select 1
      from acl.superadmin_emails
      where email = (
        select email
        from auth.users
        where id = auth.uid()
      )
    )
  );
end;
$$ language plpgsql security definer;
