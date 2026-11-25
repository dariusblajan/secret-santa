import type { TFunction } from 'i18next'
import { checkDrawable, checkThemes, type DrawIssue } from '../../../supabase/functions/_shared/draw.ts'
import type { ManageParticipant } from './api'

/** Everything that currently blocks starting the draw (same rules the server applies). */
export function startIssues(
  participants: ManageParticipant[],
  themeCount: number,
  sameGender: boolean,
): DrawIssue[] {
  const people = participants.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))
  return [...checkDrawable(people, sameGender), ...checkThemes(themeCount, people.length)]
}

export function issueMessage(t: TFunction, issue: DrawIssue): string {
  switch (issue.code) {
    case 'too_few_participants':
      return t('start.issues.too_few_participants', { min: issue.min, count: issue.count })
    case 'missing_gender':
      return t('start.issues.missing_gender', { names: issue.names.join(', ') })
    case 'group_too_small':
      return t('start.issues.group_too_small', { group: t(`start.groups.${issue.gender}`) })
    case 'too_few_themes':
      return t('start.issues.too_few_themes', { needed: issue.needed, selected: issue.selected })
  }
}
