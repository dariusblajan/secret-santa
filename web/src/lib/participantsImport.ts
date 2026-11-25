// Pure parsing for "Import participants from a file". No DOM, no spreadsheet library:
// `parseParticipantsFile` takes rows of text, so Vitest can cover it without a browser.
import { LIMITS, type Gender } from '../../../supabase/functions/_shared/validation.ts'

export const IMPORT_LIMITS = { maxFileBytes: 300 * 1024, maxRows: 500 } as const

export type ImportProblem = 'missing_name' | 'invalid_email' | 'duplicate_email' | 'bad_gender'

export interface ImportRow {
  /** 1-based row number in the file, header included, as the organizer sees it in a spreadsheet. */
  line: number
  name: string
  email: string
  gender: Gender | ''
  problems: ImportProblem[]
}

export type ParseResult =
  | { ok: true; rows: ImportRow[] }
  | { ok: false; error: 'wrong_columns' | 'empty' | 'too_many_rows' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Split CSV text into rows. Handles BOM, quoted fields, "" escapes, and `,` or `;` delimiters. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  // Romanian Excel exports `;`. Pick whichever delimiter appears more in the header line (outside quotes).
  const header = src.split(/\r?\n/, 1)[0] ?? ''
  let inQuotes = false
  let commas = 0
  let semis = 0
  for (const ch of header) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ',') commas++
    else if (!inQuotes && ch === ';') semis++
  }
  const delimiter = semis > commas ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  inQuotes = false
  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) endField()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (src[i + 1] === '\n') i++
      endRow()
    } else field += ch
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

function parseGender(raw: string): Gender | '' | 'bad' {
  const g = raw.trim().toLowerCase()
  if (g === '') return ''
  if (g === 'b') return 'boy'
  if (g === 'g') return 'girl'
  return 'bad'
}

/**
 * Turn raw rows (first row = header) into participants with per-row problems.
 * `existingEmails` are the emails already in the editor, used to flag duplicates.
 * Values are kept as plain text: nothing is ever evaluated, so "=SUM(…)" stays a string.
 */
export function parseParticipantsFile(rows: readonly (readonly unknown[])[], existingEmails: readonly string[] = []): ParseResult {
  const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim()
  const [headerRow, ...body] = rows
  if (!headerRow) return { ok: false, error: 'empty' }

  const headers = headerRow.map((h) => cell(h).toLowerCase())
  const nameCol = headers.indexOf('name')
  const emailCol = headers.indexOf('email')
  const genderCol = headers.indexOf('gender')
  if (nameCol < 0 || emailCol < 0) return { ok: false, error: 'wrong_columns' }

  const seen = new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  const out: ImportRow[] = []
  body.forEach((raw, i) => {
    const name = cell(raw[nameCol])
    const email = cell(raw[emailCol]).toLowerCase()
    const genderRaw = genderCol >= 0 ? cell(raw[genderCol]) : ''
    if (!name && !email && !genderRaw && raw.every((c) => cell(c) === '')) return // fully empty row

    const problems: ImportProblem[] = []
    if (!name || name.length > LIMITS.nameMax) problems.push('missing_name')
    if (!email || email.length > LIMITS.emailMax || !EMAIL_RE.test(email)) problems.push('invalid_email')
    else if (seen.has(email)) problems.push('duplicate_email')
    else seen.add(email)

    const gender = parseGender(genderRaw)
    if (gender === 'bad') problems.push('bad_gender')
    out.push({ line: i + 2, name, email, gender: gender === 'bad' ? '' : gender, problems })
  })

  if (out.length > IMPORT_LIMITS.maxRows) return { ok: false, error: 'too_many_rows' }
  if (out.length === 0) return { ok: false, error: 'empty' }
  return { ok: true, rows: out }
}

/** Split imported rows into what fits in the editor (15 max) and what is left out. */
export function fitToCapacity(rows: ImportRow[], currentCount: number) {
  const room = Math.max(0, LIMITS.maxParticipants - currentCount)
  return { added: rows.slice(0, room), leftOut: Math.max(0, rows.length - room) }
}

export const TEMPLATE_CSV = 'name,email,gender\nAna Popescu,ana@example.com,G\nMihai Ionescu,mihai@example.com,B\n'
