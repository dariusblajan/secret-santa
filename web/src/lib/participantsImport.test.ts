import { describe, expect, it } from 'vitest'
import { fitToCapacity, parseCsv, parseParticipantsFile, type ImportRow } from './participantsImport'

const ok = (rows: string[][], existing: string[] = []) => {
  const r = parseParticipantsFile(rows, existing)
  if (!r.ok) throw new Error(r.error)
  return r.rows
}

describe('parseCsv', () => {
  it('handles , and ; delimiters, BOM, CRLF and quotes', () => {
    expect(parseCsv('name,email\r\nAna,a@x.io\r\n')).toEqual([['name', 'email'], ['Ana', 'a@x.io']])
    expect(parseCsv('name;email;gender\nAna;a@x.io;G')).toEqual([['name', 'email', 'gender'], ['Ana', 'a@x.io', 'G']])
    expect(parseCsv('﻿name,email\n"Pop, Ana","a@x.io"')[1]).toEqual(['Pop, Ana', 'a@x.io'])
    expect(parseCsv('a,b\n"say ""hi""",x')[1][0]).toBe('say "hi"')
  })
})

describe('parseParticipantsFile', () => {
  it('accepts header variants, extra columns and any column order', () => {
    const rows = ok([[' Email ', 'NAME', 'phone', 'Gender'], ['A@X.io ', ' Ana ', '1', 'g']])
    expect(rows).toEqual([{ line: 2, name: 'Ana', email: 'a@x.io', gender: 'girl', problems: [] }])
  })

  it('maps B/G/b/g/empty and flags unknown gender', () => {
    const rows = ok([['name', 'email', 'gender'], ['A', 'a@x.io', 'B'], ['B', 'b@x.io', 'b'], ['C', 'c@x.io', ''], ['D', 'd@x.io', 'x']])
    expect(rows.map((r) => r.gender)).toEqual(['boy', 'boy', '', ''])
    expect(rows[3].problems).toEqual(['bad_gender'])
  })

  it('gender column is optional', () => {
    expect(ok([['name', 'email'], ['A', 'a@x.io']])[0].gender).toBe('')
  })

  it('ignores fully empty rows but keeps real line numbers', () => {
    const rows = ok([['name', 'email'], ['', ''], ['A', 'a@x.io']])
    expect(rows).toHaveLength(1)
    expect(rows[0].line).toBe(3)
  })

  it('flags missing name and invalid email', () => {
    const rows = ok([['name', 'email'], ['', 'a@x.io'], ['B', 'nope'], ['C', '']])
    expect(rows.map((r) => r.problems)).toEqual([['missing_name'], ['invalid_email'], ['invalid_email']])
  })

  it('flags duplicate emails in the file and against existing ones', () => {
    const rows = ok([['name', 'email'], ['A', 'a@x.io'], ['B', 'A@x.io'], ['C', 'me@x.io']], ['ME@x.io'])
    expect(rows.map((r) => r.problems)).toEqual([[], ['duplicate_email'], ['duplicate_email']])
  })

  it('reports wrong columns and empty files', () => {
    expect(parseParticipantsFile([['foo', 'bar'], ['a', 'b']])).toEqual({ ok: false, error: 'wrong_columns' })
    expect(parseParticipantsFile([])).toEqual({ ok: false, error: 'empty' })
    expect(parseParticipantsFile([['name', 'email']])).toEqual({ ok: false, error: 'empty' })
  })

  it('keeps formula-looking cells as plain text', () => {
    const rows = ok([['name', 'email'], ['=HYPERLINK("x")', '+a@x.io'], ['@cmd', '-b@x.io']])
    expect(rows[0].name).toBe('=HYPERLINK("x")')
    expect(rows[1].name).toBe('@cmd')
  })

  it('rejects absurdly long files', () => {
    const body = Array.from({ length: 501 }, (_, i) => [`P${i}`, `p${i}@x.io`])
    expect(parseParticipantsFile([['name', 'email'], ...body])).toEqual({ ok: false, error: 'too_many_rows' })
  })
})

describe('fitToCapacity', () => {
  it('leaves out rows beyond 15 participants', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ line: i + 2 }) as ImportRow)
    const { added, leftOut } = fitToCapacity(rows, 3)
    expect(added).toHaveLength(12)
    expect(leftOut).toBe(8)
    expect(fitToCapacity(rows, 15)).toEqual({ added: [], leftOut: 20 })
  })
})
