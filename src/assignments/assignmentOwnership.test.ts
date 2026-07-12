import { describe, it, expect } from 'vitest'
import { isCollectedAssignmentUrl, isUserManagedUrl } from './assignmentOwnership'

const BASE = 'https://letus.ed.tus.ac.jp'

describe('isCollectedAssignmentUrl', () => {
  it('収集対象modはtrue', () => {
    for (const mod of ['assign', 'quiz', 'turnitintool', 'turnitintooltwo', 'workshop', 'feedback', 'choice', 'questionnaire', 'lti']) {
      expect(isCollectedAssignmentUrl(`${BASE}/mod/${mod}/view.php?id=1`)).toBe(true)
    }
  })
  it('収集対象外modはfalse', () => {
    for (const mod of ['resource', 'folder', 'page', 'url', 'book', 'label', 'glossary', 'wiki', 'forum', 'survey', 'lesson']) {
      expect(isCollectedAssignmentUrl(`${BASE}/mod/${mod}/view.php?id=1`)).toBe(false)
    }
  })
  it('manual:// はfalse', () => {
    expect(isCollectedAssignmentUrl('manual://123_abc')).toBe(false)
  })
})

describe('isUserManagedUrl', () => {
  it('manual:// はtrue', () => {
    expect(isUserManagedUrl('manual://123_abc')).toBe(true)
  })
  it('収集対象外(PDF resource等)はtrue', () => {
    expect(isUserManagedUrl(`${BASE}/mod/resource/view.php?id=9`)).toBe(true)
    expect(isUserManagedUrl(`${BASE}/mod/forum/view.php?id=9`)).toBe(true)
  })
  it('収集対象(assign/quiz)はfalse', () => {
    expect(isUserManagedUrl(`${BASE}/mod/assign/view.php?id=9`)).toBe(false)
    expect(isUserManagedUrl(`${BASE}/mod/quiz/view.php?id=9`)).toBe(false)
  })
})
