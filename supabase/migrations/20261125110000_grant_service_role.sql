-- The Edge Functions use the service role. Grant it explicit access to our tables
-- instead of relying on the project's default privileges (which differ between projects).
-- anon/authenticated stay locked out on purpose: RLS is on and they have no grants.

grant usage on schema public to service_role;
grant select, insert, update, delete on public.parties to service_role;
grant select, insert, update, delete on public.participants to service_role;
