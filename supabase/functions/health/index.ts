import { json, preflight } from '../_shared/cors.ts'

Deno.serve((req) => {
  const early = preflight(req)
  if (early) return early
  return json(req, { ok: true, time: new Date().toISOString() })
})
