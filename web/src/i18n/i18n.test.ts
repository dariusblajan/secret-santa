import { describe, expect, it } from 'vitest'
import en from './en.json'
import ro from './ro.json'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Keys with plural suffixes collapse to their base key (so ro can have more forms than en). */
function baseKeys(file: Record<string, unknown>): string[] {
  return [...new Set(flatten(file).map((k) => k.replace(PLURAL_SUFFIX, '')))].sort()
}

function pluralForms(file: Record<string, unknown>, base: string): string[] {
  return flatten(file)
    .filter((k) => k.startsWith(`${base}_`) && PLURAL_SUFFIX.test(k))
    .map((k) => k.slice(base.length + 1))
    .sort()
}

describe('translations', () => {
  it('en and ro define the same keys', () => {
    expect(baseKeys(ro)).toEqual(baseKeys(en))
  })

  it('has no empty strings', () => {
    for (const file of [en, ro]) {
      for (const key of flatten(file)) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], file)
        expect(String(value).trim().length, key).toBeGreaterThan(0)
      }
    }
  })

  it('has all plural forms: en one/other, ro one/few/other', () => {
    expect(pluralForms(en, 'manage.participantsHeading')).toEqual(['one', 'other'])
    expect(pluralForms(ro, 'manage.participantsHeading')).toEqual(['few', 'one', 'other'])
  })
})
