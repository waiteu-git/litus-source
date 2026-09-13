import { describe, expect, it } from 'vitest'
import {
  DIAG_MAILTO_SAFE_LIMIT,
  DIAG_REPORT_TO,
  buildMailtoUrl,
  formatAndroidDevice,
  formatDiagEnv,
  iosDeviceFromIdiom,
  mailtoMayTruncate,
  type DiagEnv,
} from './diagReport'

const ENV: DiagEnv = {
  appVersion: '1.0.0',
  buildNumber: '200',
  releaseStage: 'production',
  os: 'Android',
  osVersion: '15',
  device: 'Google Pixel 8',
}

describe('formatAndroidDevice', () => {
  it('メーカー名と型番を並べる（型番だけでは読めない端末のため）', () => {
    expect(formatAndroidDevice('samsung', 'SM-S911B')).toBe('samsung SM-S911B')
  })

  it('型番が既にメーカー名で始まるなら重複させない', () => {
    expect(formatAndroidDevice('Xiaomi', 'Xiaomi 14')).toBe('Xiaomi 14')
    expect(formatAndroidDevice('Google', 'google pixel 8')).toBe('google pixel 8')
  })

  it('片方しか取れなくても壊れない', () => {
    expect(formatAndroidDevice('Google', '')).toBe('Google')
    expect(formatAndroidDevice('', 'Pixel 8')).toBe('Pixel 8')
    expect(formatAndroidDevice(undefined, undefined)).toBe(null)
    expect(formatAndroidDevice(null, null)).toBe(null)
  })
})

describe('iosDeviceFromIdiom', () => {
  it('iPhone / iPad を区別する', () => {
    expect(iosDeviceFromIdiom('phone')).toBe('iPhone')
    expect(iosDeviceFromIdiom('pad')).toBe('iPad')
  })

  it('未知の種別は名乗らない（推測で機種名を作らない）', () => {
    expect(iosDeviceFromIdiom('unspecified')).toBe(null)
    expect(iosDeviceFromIdiom(undefined)).toBe(null)
  })
})

describe('formatDiagEnv', () => {
  it('版・OS・機種を載せる', () => {
    expect(formatDiagEnv(ENV)).toBe('リタス v1.0.0 (build 200)\nAndroid 15 / Google Pixel 8')
  })

  it('機種が取れないプラットフォームではOS行だけになる', () => {
    expect(formatDiagEnv({ ...ENV, os: 'iOS', osVersion: '18.5', device: null })).toBe(
      'リタス v1.0.0 (build 200)\niOS 18.5',
    )
  })

  it('production 以外は開発版と分かる（どのビルドの報告か取り違えない）', () => {
    expect(formatDiagEnv({ ...ENV, releaseStage: 'beta' })).toContain('（開発版）')
    expect(formatDiagEnv(ENV)).not.toContain('（開発版）')
  })

  it('OS版が取れなくても壊れない', () => {
    expect(formatDiagEnv({ ...ENV, osVersion: null })).toBe('リタス v1.0.0 (build 200)\nAndroid / Google Pixel 8')
  })
})

describe('buildMailtoUrl', () => {
  it('宛先・件名・本文をmailtoに載せる', () => {
    const url = buildMailtoUrl({ to: DIAG_REPORT_TO, subject: 'あ い', body: 'x\ny' })
    expect(url.startsWith('mailto:contact@waiteu.dev?')).toBe(true)
    expect(url).toContain('subject=%E3%81%82%20%E3%81%84')
    expect(url).toContain('body=x%0Ay')
  })

  it('空白を + にしない（本文に + がそのまま出る事故を避ける）', () => {
    const url = buildMailtoUrl({ to: DIAG_REPORT_TO, subject: 's', body: 'a b' })
    expect(url).toContain('body=a%20b')
    expect(url).not.toContain('body=a+b')
  })

  it('& や = を含む本文でもクエリが壊れない', () => {
    const url = buildMailtoUrl({ to: DIAG_REPORT_TO, subject: 's', body: 'status=200&ok=false' })
    expect(url).toContain('body=status%3D200%26ok%3Dfalse')
    expect(url.split('&').length).toBe(2)
  })
})

describe('mailtoMayTruncate', () => {
  it('目安を超えたら真', () => {
    expect(mailtoMayTruncate('mailto:a?body=' + 'x'.repeat(DIAG_MAILTO_SAFE_LIMIT))).toBe(true)
    expect(mailtoMayTruncate('mailto:a?body=x')).toBe(false)
  })
})
