import { createClient } from 'npm:@supabase/supabase-js@2'

/** Service-role client. Bypasses RLS, so only use it inside functions after checking tokens. */
export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase environment is not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
