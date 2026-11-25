import type { TFunction } from 'i18next'
import { checkDrawable, checkThemes, type DrawIssue } from '../../../supabase/functions/_shared/draw.ts'
import type { ManageExclusion, ManageParticipant } from './api'

/** Everything that currently blocks starting the draw (same rules the server applies). */
export function startIssues(
  participants: ManageParticipant[],
  themeCount: number,
  sameGender: boolean,
  exclusions: ManageExclusion[] = [],
): DrawIssue[] {
  const people = participants.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))
  return [...checkDrawable(people, sameGender, exclusions), ...checkThemes(themeCount, people.length)]
}

export function issueMessage(t: TFunction, issue: DrawIssue): string {
  switch (issue.code) {
    case 'too_few_participants':
      return t('start.issues.too_few_participants', { min: issue.min, count: issue.count })
    case 'missing_gender':
      return t('start.issues.missing_gender', { names: issue.names.join(', ') })
    case 'group_too_small':
      return t('start.issues.group_too_small', { group: t(`start.groups.${issue.gender}`) })
    case 'no_allowed_giftee':
      return t('start.issues.no_allowed_giftee', { name: issue.name })
    case 'no_allowed_giver':
      return t('start.issues.no_allowed_giver', { name: issue.name })
    case 'no_valid_cycle':
      return t('start.issues.no_valid_cycle')
    case 'too_few_themes':
      return t('start.issues.too_few_themes', { needed: issue.needed, selected: issue.selected })
  }
}
