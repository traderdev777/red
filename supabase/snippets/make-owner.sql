-- Run in the Supabase SQL editor (connected as postgres). The app can never do this.
update public.profiles
   set role = 'owner'
 where email = 'you@example.com';   -- replace with your sign-in email

-- Check:
select id, email, role, daily_scan_limit from public.profiles where role = 'owner';

-- Undo:
-- update public.profiles set role = 'user' where email = 'you@example.com';
