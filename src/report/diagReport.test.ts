import { describe, expect, it } from 'vitest'
import type { SubmitDiag } from '../attendance/submitDiag'
import {
  DIAG_MAILTO_SAFE_LIMIT,
  DIAG_REPORT_TO,
  buildDiagReportBody,
  buildDiagReportSubject,
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

function diag(over: Partial<SubmitDiag> = {}): SubmitDiag {
  return {
    at: '2026-07-30T02:10:00.000Z',
    courseName: '線形代数1',
    ok: false,
    wrong: false,
    err: false,
    result: '送信しました（下の画面で結果をご確認ください）',
    btnFound: true,
    method: 'onclick',
    filled: 4,
    ajaxFired: true,
    ajaxDone: true,
    ajaxStatus: 200,
    ...over,
  }
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

describe('buildDiagReportSubject', () => {
  it('buildを件名に入れる', () => {
    expect(buildDiagReportSubject(ENV)).toBe('リタスの不具合報告（build 200）')
  })

  it('build不明でも件名を作れる', () => {
    expect(buildDiagReportSubject({ ...ENV, buildNumber: null })).toBe('リタスの不具合報告（build ?）')
  })
})

describe('buildDiagReportBody', () => {
  const body = buildDiagReportBody({ diags: [diag(), diag({ kind: 'reaction', filled: 120 })], env: ENV, nowIso: '2026-07-30T03:00:00.000Z' })

  it('状況欄が先頭＝最初に目に入る', () => {
    expect(body.startsWith('■ 状況')).toBe(true)
  })

  it('環境情報と書き出し時刻を含む', () => {
    expect(body).toContain('リタス v1.0.0 (build 200)')
    expect(body).toContain('Android 15 / Google Pixel 8')
    expect(body).toContain('書き出し 2026-07-30T03:00:00.000Z')
  })

  it('記録を件数つきで全件載せる（省略しない）', () => {
    expect(body).toContain('■ 出席送信の記録（2件）')
    expect(body).toContain('--- 1 ---')
    expect(body).toContain('--- 2 ---')
    expect(body).toContain('線形代数1')
    // リアペの記録も同じ器に入るので接頭辞で区別できること
    expect(body).toContain('[リアペ]')
  })

  it('そのまま送られると明示する（「見せてから送る」の担保）', () => {
    expect(body).toContain('この本文がそのまま送られます')
  })

  it('記録が0件でも本文を作れる（診断が残らない不具合も報告できる）', () => {
    const empty = buildDiagReportBody({ diags: [], env: ENV, nowIso: '2026-07-30T03:00:00.000Z' })
    expect(empty).toContain('■ 出席送信の記録（0件）')
    expect(empty).toContain('（記録はありません）')
  })

  it('学籍番号・氏名・メールアドレスを本文に入れる経路が無い', () => {
    // 入力は diags と env だけ＝この2つに無いものは構造的に出ない。
    // 万一 env にPIIを足す変更が入ったらここが気づける最後の砦になる。
    expect(Object.keys(ENV).sort()).toEqual([
      'appVersion',
      'buildNumber',
      'device',
      'os',
      'osVersion',
      'releaseStage',
    ])
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
    // subject と body の区切りの & は1つだけ＝本文の & がパラメータとして解釈されない
    expect(url.split('&').length).toBe(2)
  })
})

describe('mailtoMayTruncate', () => {
  it('目安を超えたら真（コピーを主動線へ切り替える判断に使う）', () => {
    expect(mailtoMayTruncate('mailto:a?body=' + 'x'.repeat(DIAG_MAILTO_SAFE_LIMIT))).toBe(true)
    expect(mailtoMayTruncate('mailto:a?body=x')).toBe(false)
  })

  it('記録10件が満杯だと目安を超える＝コピー導線が必須になる', () => {
    // 「メールで送るだけ」では足りないことを、実データ相当の量で固定する。
    const full = Array.from({ length: 10 }, () => diag({ hint: 'あ'.repeat(80), okBy: 'い'.repeat(80) }))
    const url = buildMailtoUrl({
      to: DIAG_REPORT_TO,
      subject: buildDiagReportSubject(ENV),
      body: buildDiagReportBody({ diags: full, env: ENV, nowIso: '2026-07-30T03:00:00.000Z' }),
    })
    expect(mailtoMayTruncate(url)).toBe(true)
  })
})
