// Pure TypeScript (no Deno/DOM-only APIs): shared by Edge Functions and the web app.
import { LIMITS, type Gender } from './validation.ts'

export interface DrawParticipant {
  id: string
  name: string
  gender: Gender | null
}

export type DrawIssue =
  | { code: 'too_few_participants'; min: number; count: number }
  | { code: 'missing_gender'; names: string[] }
  | { code: 'group_too_small'; gender: Gender }
  | { code: 'too_few_themes'; needed: number; selected: number }
  | { code: 'no_allowed_giftee'; name: string }
  | { code: 'no_allowed_giver'; name: string }
  | { code: 'no_valid_cycle' }

/** Directional rule: giverId can't buy for gifteeId. */
export interface DrawExclusion {
  giverId: string
  gifteeId: string
}

export class DrawError extends Error {
  readonly issues: DrawIssue[]
  constructor(issues: DrawIssue[]) {
    super(issues.map((i) => i.code).join(', '))
    this.issues = issues
  }
}

/** Uniform random integer in [0, max) using the crypto RNG (rejection sampling, no modulo bias). */
export function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  let x: number
  do {
    crypto.getRandomValues(buf)
    x = buf[0]
  } while (x >= limit)
  return x % max
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Everything that would stop the draw from running. Empty array means OK. */
export function checkDrawable(
  participants: readonly DrawParticipant[],
  sameGender: boolean,
  exclusions: readonly DrawExclusion[] = [],
  searchCycle = true,
): DrawIssue[] {
  const issues: DrawIssue[] = []
  if (participants.length < LIMITS.minParticipantsToStart) {
    issues.push({ code: 'too_few_participants', min: LIMITS.minParticipantsToStart, count: participants.length })
  }
  if (sameGender) {
    const missing = participants.filter((p) => p.gender === null).map((p) => p.name)
    if (missing.length > 0) {
      issues.push({ code: 'missing_gender', names: missing })
    } else {
      for (const gender of ['girl', 'boy'] as const) {
        const count = participants.filter((p) => p.gender === gender).length
        if (count === 1) issues.push({ code: 'group_too_small', gender })
      }
    }
  }
  if (issues.length === 0) issues.push(...checkExclusions(groupsOf(participants, sameGender), exclusions, searchCycle))
  return issues
}

export function checkThemes(selected: number, participantCount: number): DrawIssue[] {
  return selected < participantCount ? [{ code: 'too_few_themes', needed: participantCount, selected }] : []
}

function groupsOf(participants: readonly DrawParticipant[], sameGender: boolean): DrawParticipant[][] {
  return sameGender
    ? [participants.filter((p) => p.gender === 'girl'), participants.filter((p) => p.gender === 'boy')]
    : [[...participants]]
}

/** allowed[i][j] is true when group[i] may buy for group[j]. */
function allowedMatrix(group: readonly DrawParticipant[], exclusions: readonly DrawExclusion[]): boolean[][] {
  const index = new Map(group.map((p, i) => [p.id, i]))
  const allowed = group.map((_, i) => group.map((_, j) => i !== j))
  for (const e of exclusions) {
    const i = index.get(e.giverId)
    const j = index.get(e.gifteeId)
    if (i !== undefined && j !== undefined && i !== j) allowed[i][j] = false
  }
  return allowed
}

/**
 * Counts Hamiltonian cycles through node 0 with a bitmask DP (n <= 15, so at most ~0.5M states).
 * paths[mask * n + v] = number of paths 0 -> ... -> v visiting exactly the nodes in mask.
 */
function cycleTable(allowed: boolean[][]) {
  const n = allowed.length
  const paths = new Float64Array((1 << n) * n)
  paths[1 * n + 0] = 1
  for (let mask = 1; mask < 1 << n; mask += 2) {
    for (let v = 0; v < n; v++) {
      const c = paths[mask * n + v]
      if (c === 0) continue
      for (let w = 1; w < n; w++) {
        if (!(mask & (1 << w)) && allowed[v][w]) paths[(mask | (1 << w)) * n + w] += c
      }
    }
  }
  return paths
}

function closingEdges(allowed: boolean[][], paths: Float64Array): number[] {
  const n = allowed.length
  const full = (1 << n) - 1
  return Array.from({ length: n }, (_, v) => v).filter((v) => allowed[v][0] && paths[full * n + v] > 0)
}

function checkExclusions(
  groups: DrawParticipant[][],
  exclusions: readonly DrawExclusion[],
  searchCycle: boolean,
): DrawIssue[] {
  if (exclusions.length === 0) return []
  const issues: DrawIssue[] = []
  for (const group of groups) {
    const ids = new Set(group.map((p) => p.id))
    if (!exclusions.some((e) => ids.has(e.giverId) && ids.has(e.gifteeId))) continue
    const allowed = allowedMatrix(group, exclusions)
    const n = group.length
    const before = issues.length
    group.forEach((p, i) => {
      if (!allowed[i].some(Boolean)) issues.push({ code: 'no_allowed_giftee', name: p.name })
      if (!allowed.some((row) => row[i])) issues.push({ code: 'no_allowed_giver', name: p.name })
    })
    if (searchCycle && issues.length === before && closingEdges(allowed, cycleTable(allowed)).length === 0 && n > 1) {
      issues.push({ code: 'no_valid_cycle' })
    }
  }
  return issues
}

/** Link everyone into one random cycle: A gives to B, B to C, ... last to A. */
function cycle(group: readonly DrawParticipant[], out: Record<string, string>, exclusions: readonly DrawExclusion[]) {
  const order = shuffle(group)
  const ids = new Set(order.map((p) => p.id))
  if (!exclusions.some((e) => ids.has(e.giverId) && ids.has(e.gifteeId))) {
    order.forEach((giver, i) => {
      out[giver.id] = order[(i + 1) % order.length].id
    })
    return
  }

  // Exclusions: pick a uniformly random valid cycle by walking the DP table backwards.
  const allowed = allowedMatrix(order, exclusions)
  const n = order.length
  const paths = cycleTable(allowed)
  const pickWeighted = (candidates: number[], weight: (v: number) => number): number => {
    const total = candidates.reduce((sum, v) => sum + weight(v), 0)
    if (total === 0) throw new DrawError([{ code: 'no_valid_cycle' }])
    // total can exceed 2^32, so draw from a 53-bit uniform instead of randomInt.
    const buf = new Uint32Array(2)
    crypto.getRandomValues(buf)
    let r = ((buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53) * total
    for (const v of candidates) {
      r -= weight(v)
      if (r < 0) return v
    }
    return candidates[candidates.length - 1]
  }

  const full = (1 << n) - 1
  const closing = closingEdges(allowed, paths)
  let v = pickWeighted(closing, (x) => paths[full * n + x])
  let mask = full
  const seq = [v]
  while (mask !== 1) {
    const prevMask = mask ^ (1 << v)
    const preds = Array.from({ length: n }, (_, u) => u).filter((u) => allowed[u][v] && paths[prevMask * n + u] > 0)
    const u = pickWeighted(preds, (x) => paths[prevMask * n + x])
    seq.push(u)
    mask = prevMask
    v = u
  }
  seq.reverse() // starts at node 0
  seq.forEach((node, i) => {
    out[order[node].id] = order[seq[(i + 1) % n]].id
  })
}

/**
 * Decide who buys for whom. Returns giverId -> gifteeId.
 * A single random cycle guarantees nobody draws themselves and (for 3+ people in a group)
 * that nobody gets a mutual swap. In same-gender mode a cycle is made inside each gender group;
 * a group of exactly 2 is a forced mutual swap, which is allowed.
 * Exclusions ("giver can't buy for giftee") restrict which cycles are valid; with none, the
 * behaviour is the plain random cycle.
 */
export function drawAssignments(
  participants: readonly DrawParticipant[],
  sameGender: boolean,
  exclusions: readonly DrawExclusion[] = [],
): Record<string, string> {
  // The cycle search itself throws no_valid_cycle, so the check skips its own (identical) search here.
  const issues = checkDrawable(participants, sameGender, exclusions, false)
  if (issues.length > 0) throw new DrawError(issues)

  const out: Record<string, string> = {}
  for (const group of groupsOf(participants, sameGender)) cycle(group, out, exclusions)
  return out
}
