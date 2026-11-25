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
export function checkDrawable(participants: readonly DrawParticipant[], sameGender: boolean): DrawIssue[] {
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
  return issues
}

export function checkThemes(selected: number, participantCount: number): DrawIssue[] {
  return selected < participantCount ? [{ code: 'too_few_themes', needed: participantCount, selected }] : []
}

/** Link everyone into one random cycle: A gives to B, B to C, ... last to A. */
function cycle(group: readonly DrawParticipant[], out: Record<string, string>) {
  const order = shuffle(group)
  order.forEach((giver, i) => {
    out[giver.id] = order[(i + 1) % order.length].id
  })
}

/**
 * Decide who buys for whom. Returns giverId -> gifteeId.
 * A single random cycle guarantees nobody draws themselves and (for 3+ people in a group)
 * that nobody gets a mutual swap. In same-gender mode a cycle is made inside each gender group;
 * a group of exactly 2 is a forced mutual swap, which is allowed.
 */
export function drawAssignments(participants: readonly DrawParticipant[], sameGender: boolean): Record<string, string> {
  const issues = checkDrawable(participants, sameGender)
  if (issues.length > 0) throw new DrawError(issues)

  const out: Record<string, string> = {}
  if (sameGender) {
    cycle(participants.filter((p) => p.gender === 'girl'), out)
    cycle(participants.filter((p) => p.gender === 'boy'), out)
  } else {
    cycle(participants, out)
  }
  return out
}
