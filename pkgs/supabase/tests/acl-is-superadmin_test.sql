BEGIN;
SELECT plan(0);

-- insert into acl.superadmin_emails (email) values ('admin@example.com');
-- insert into auth.users (email) values
-- 	('admin@example.com'),
-- 	('other-admin@example.com');



SELECT * FROM finish();
ROLLBACK;
