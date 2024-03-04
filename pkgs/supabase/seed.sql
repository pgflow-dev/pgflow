insert into acl.superadmin_emails (email) values
  ('admin@example.com')
  on conflict do nothing;
