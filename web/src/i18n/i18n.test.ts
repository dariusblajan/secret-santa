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

describe('translations', () => {
  it('en and ro have exactly the same keys', () => {
    expect(flatten(ro).sort()).toEqual(flatten(en).sort())
  })

  it('has no empty strings', () => {
    for (const file of [en, ro]) {
      for (const key of flatten(file)) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], file)
        expect(String(value).trim().length, key).toBeGreaterThan(0)
      }
    }
  })
})
