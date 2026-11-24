-- ONE-OFF: make an account the admin.
-- 1. Change the email below to the account's email (keep the quote marks).
-- 2. Paste into Supabase -> SQL Editor -> New query, and click Run.
-- It shows the account afterwards; the "role" column should say admin.
-- If no row appears, the email doesn't match an account: check the spelling.

update public.profiles
set role = 'admin'
where id = (select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com'))
returning display_name, role;
