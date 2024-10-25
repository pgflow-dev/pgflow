insert into acl.superadmin_emails (email) values
('admin@example.com'),
('wojciech.majewski@pm.me'),
('jumski@gmail.com'),
('gajewsky@pm.me')
on conflict do nothing;
