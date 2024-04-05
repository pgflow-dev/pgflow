insert into acl.superadmin_emails (email) values
  ('admin@example.com'),
  ('wojciech.majewski@pm.me'),
  ('majewskibartosz@pm.me'),
  ('amadeusz.filipek@protonmail.com')
  on conflict do nothing;
