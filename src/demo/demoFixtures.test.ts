import { describe, it, expect } from 'vitest'
import {
  DEMO_TIMETABLE,
  DEMO_ASSIGNMENTS,
  DEMO_BULLETINS,
  DEMO_ATTENDANCE_STATS,
  DEMO_CLASS_EVENTS,
  DEMO_TERMS_CONSENT,
  DEMO_ONBOARDING,
} from './demoFixtures'
import { serializeTimetable, deserializeTimetable } from '../storage/timetableSerialize'
import { serializeAssignments, deserializeAssignments } from '../storage/assignmentsSerialize'
import { serializeBulletinDigest, deserializeBulletinDigest } from '../storage/bulletinDigestSerialize'
import {
  serializeAttendanceStats,
  deserializeAttendanceStats,
} from '../storage/attendanceStatsSerialize'
import { serializeClassEvents, deserializeClassEvents } from '../storage/classEventsSerialize'
import { serializeTermsConsent, deserializeTermsConsent } from '../storage/termsConsentSerialize'
import { serializeOnboardingDone, deserializeOnboardingDone } from '../storage/onboardingSerialize'
import { TERMS_VERSION } from '../legal/termsVersion'

/**
 * デモデータが既存の serialize 層を往復することを保証する。
 * ここが通らないデータを投入すると、**審査中にアプリがクラッシュする**。
 */
describe('デモデータの整合性', () => {
  it('時間割が serialize→deserialize を往復する', () => {
    expect(deserializeTimetable(serializeTimetable(DEMO_TIMETABLE))).toEqual(DEMO_TIMETABLE)
  })

  it('課題が serialize→deserialize を往復する', () => {
    expect(deserializeAssignments(serializeAssignments(DEMO_ASSIGNMENTS))).toEqual(DEMO_ASSIGNMENTS)
  })

  it('掲示が serialize→deserialize を往復する', () => {
    expect(deserializeBulletinDigest(serializeBulletinDigest(DEMO_BULLETINS))).toEqual(DEMO_BULLETINS)
  })

  it('出席統計が serialize→deserialize を往復する', () => {
    const data = { courses: DEMO_ATTENDANCE_STATS, collectedAt: 1767225600000 }
    expect(deserializeAttendanceStats(serializeAttendanceStats(data))).toEqual(data)
  })

  it('授業イベントが serialize→deserialize を往復する', () => {
    expect(deserializeClassEvents(serializeClassEvents(DEMO_CLASS_EVENTS))).toEqual(DEMO_CLASS_EVENTS)
  })

  it('規約同意が現行版で、デモ起動時に同意画面へ戻らない', () => {
    expect(DEMO_TERMS_CONSENT).toBe(TERMS_VERSION)
    expect(deserializeTermsConsent(serializeTermsConsent(DEMO_TERMS_CONSENT))).toBe(TERMS_VERSION)
  })

  it('オンボーディング完了済みで、デモ起動時にスライドへ戻らない', () => {
    expect(DEMO_ONBOARDING).toBe(true)
    expect(deserializeOnboardingDone(serializeOnboardingDone(DEMO_ONBOARDING))).toBe(true)
  })

  it('実在の大学・システム名を含まない（5.2.2対策）', () => {
    const json = JSON.stringify({
      DEMO_TIMETABLE,
      DEMO_ASSIGNMENTS,
      DEMO_BULLETINS,
      DEMO_ATTENDANCE_STATS,
      DEMO_CLASS_EVENTS,
    })
    expect(json).not.toMatch(/東京理科|理科大|tus\.ac\.jp|letus|shibboleth/i)
  })

  it('デモ課題のURLが実在ドメインを指さない', () => {
    for (const url of Object.keys(DEMO_ASSIGNMENTS)) {
      expect(url).toMatch(/^demo:/)
    }
  })

  it('全画面ぶんのデータが空でない（審査員が機能を見られる）', () => {
    expect(DEMO_TIMETABLE.length).toBeGreaterThan(0)
    expect(DEMO_TIMETABLE[0].slots.length).toBeGreaterThan(0)
    expect(Object.keys(DEMO_ASSIGNMENTS).length).toBeGreaterThan(0)
    expect(DEMO_BULLETINS.length).toBeGreaterThan(0)
    expect(DEMO_ATTENDANCE_STATS.length).toBeGreaterThan(0)
    expect(DEMO_CLASS_EVENTS.length).toBeGreaterThan(0)
  })
})
