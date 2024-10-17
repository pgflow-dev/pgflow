create schema if not exists acl;

create table if not exists acl.superadmin_emails
(
    email text primary key
);

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

-- Create a trigger function to check if the email is in acl.superadmin_emails
create or replace function public.check_superadmin_email()
returns trigger as $$
begin
  if not exists (select 1 from acl.superadmin_emails where email = new.email) then
    raise exception 'email % is not in the superadmin_emails table', new.email;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- create a trigger on auth.users table
create trigger enforce_superadmin_email
before insert or update on auth.users
for each row
execute function public.check_superadmin_email();
