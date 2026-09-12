import { describe, expect, it } from 'vitest'
import type { SubmitDiag } from '../attendance/submitDiag'
import {
  DIAG_MAILTO_SAFE_LIMIT,
  DIAG_REPORT_TO,
  buildDiagReportBody,
  buildDiagReportSubject,
  buildMailtoUrl,
  diagNotePlaceholder,
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

  it('シートで書いた状況をそのまま「■ 状況」節へ載せる', () => {
    const withNote = buildDiagReportBody({
      diags: [],
      env: ENV,
      nowIso: '2026-07-30T03:00:00.000Z',
      source: 'settings',
      note: '7/30から時間割の水曜だけ何も出ません',
    })
    expect(withNote.startsWith('■ 状況\n7/30から時間割の水曜だけ何も出ません')).toBe(true)
    expect(withNote).not.toContain('（未記入）')
  })

  it('改行を保ったまま載せる（前後の空白だけ落とす）', () => {
    const multi = buildDiagReportBody({
      diags: [],
      env: ENV,
      nowIso: '2026-07-30T03:00:00.000Z',
      source: 'settings',
      note: '\n 1行目\n2行目 \n\n',
    })
    expect(multi.startsWith('■ 状況\n1行目\n2行目\n')).toBe(true)
  })

  /**
   * **未記入は「節ごと落とす」ではなく「見出し＋（未記入）」**。
   * 落とすと受け取った側が「書かれなかった」のか「組み立てが壊れて消えた」のか区別できない。
   * 見出しが残っていれば、メールアプリ側で書き足す逃げ道も残る。
   */
  it('未記入なら見出しを残して（未記入）と書く', () => {
    for (const note of [undefined, '', '   \n \t ']) {
      const empty = buildDiagReportBody({
        diags: [],
        env: ENV,
        nowIso: '2026-07-30T03:00:00.000Z',
        source: 'settings',
        note,
      })
      expect(empty.startsWith('■ 状況\n（未記入）')).toBe(true)
    }
  })

  it('例文と添付の案内は本文に載せない（mailtoの尺を入力ぶんへ空ける）', () => {
    const b = buildDiagReportBody({
      diags: [],
      env: ENV,
      nowIso: '2026-07-30T03:00:00.000Z',
      source: 'settings',
      note: 'x',
    })
    expect(b).not.toContain('例:')
    expect(b).not.toContain('スクリーンショット')
    expect(b).not.toContain('ここに書き足してください')
  })

  it('学籍番号・氏名・メールアドレスを本文に入れる経路が無い', () => {
    // アプリが勝手に載せる入力は diags と env だけ＝この2つに無いものは構造的に出ない
    // （`note` は第3の入力だが、ユーザーが自分で書いて自分で読んでから送る＝「見せてから送る」の内側）。
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
  it('目安を超えたら真', () => {
    expect(mailtoMayTruncate('mailto:a?body=' + 'x'.repeat(DIAG_MAILTO_SAFE_LIMIT))).toBe(true)
    expect(mailtoMayTruncate('mailto:a?body=x')).toBe(false)
  })

  /**
   * **記録を載せる入口でコピーを主動線に固定した根拠をここで固定する。**
   * 日本語はパーセントエンコードで約3倍に膨らむので、記録が1件でも mailto URL は目安を超える
   * ＝「長い時だけ警告」は100%発火して警告にならない。この2つが両方真である限り、
   * **出席側（`source: 'attendance'`）を** mailto 主動線へ戻してはいけない。
   *
   * ⚠**設定側（`source: 'settings'`）はこの制約の外**。記録を載せないので mailto に収まり、
   * メールを主動線にできる（下のテストで固定）。**この2つを混ぜないこと。**
   */
  it('記録が付く入口では、1件でも目安を超える（＝mailtoを主動線にできない）', () => {
    const url = mailtoFor([diag({ hint: HINT_REAL, okBy: OKBY_REAL })])
    expect(mailtoMayTruncate(url)).toBe(true)
    // 目安すれすれではなく余裕をもって超える＝定型部分が多少痩せても結論は変わらない。
    // 実測 2,308 文字（2026-08-10。例文を本文からプレースホルダへ移す前は 2,917）。
    expect(url.length).toBeGreaterThan(2200)
  })

  it('記録10件が満杯だと1万文字を超える', () => {
    const full = Array.from({ length: 10 }, () => diag({ hint: HINT_REAL, okBy: OKBY_REAL }))
    expect(mailtoFor(full).length).toBeGreaterThan(10000)
  })

  /**
   * **設定側で「メールで送る」を主動線にした根拠。**
   * 記録を載せないので、記録が10件あっても本文は環境情報だけで mailto に収まる。
   * ここが偽になったら（＝本文が育って目安を超えたら）設定側もコピー主動線へ戻すこと。
   */
  it('設定から開くと、記録が満杯でも目安に収まる（＝メールを主動線にできる）', () => {
    const full = Array.from({ length: 10 }, () => diag({ hint: HINT_REAL, okBy: OKBY_REAL }))
    const body = buildDiagReportBody({ diags: full, env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'settings' })
    const url = buildMailtoUrl({ to: 'a@b.c', subject: buildDiagReportSubject(ENV), body })
    expect(mailtoMayTruncate(url)).toBe(false)
    expect(body).not.toContain('出席送信の記録')
  })

  /**
   * **設定側で「メールで送る」を主動線に固定できる境界。**
   * 本文が育つ余地は入力欄しかない（記録は載らない）ので、長く書かれた時だけコピーへ入れ替わる。
   * ここが「短文で真」に転んだら、入力欄より先に本文の定型部分が太った合図。
   */
  it('設定側でも長く書かれれば目安を超える（＝そこで主動線をコピーへ入れ替える）', () => {
    expect(mailtoMayTruncate(settingsUrl('あ'.repeat(50)))).toBe(false)
    expect(mailtoMayTruncate(settingsUrl('あ'.repeat(300)))).toBe(true)
  })

  it('source 未指定は安全側（記録を載せる＝コピー主動線）に倒れる', () => {
    const one = [diag({ hint: HINT_REAL, okBy: OKBY_REAL })]
    const implicit = buildDiagReportBody({ diags: one, env: ENV, nowIso: '2026-07-30T03:00:00.000Z' })
    const explicit = buildDiagReportBody({ diags: one, env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'attendance' })
    expect(implicit).toBe(explicit)
    expect(implicit).toContain('出席送信の記録')
  })
})

/** 実際に端末で観測したマスク後の `hint`（IP・認証コードはマスク済み）。 */
const HINT_REAL =
  '出席登録が完了しました。最終打刻：12:50／認証コード：****／現在、出席確認中の履修授業はありません。（アクセス元 ***.***.***.***）'
/** 実際の `okBy`（一致文言＋前後40字）。 */
const OKBY_REAL = '…直前40字ぶんの本文…「出席登録しました」…直後40字ぶんの本文がここに入ります…'

function mailtoFor(diags: SubmitDiag[]): string {
  return buildMailtoUrl({
    to: DIAG_REPORT_TO,
    subject: buildDiagReportSubject(ENV),
    body: buildDiagReportBody({ diags, env: ENV, nowIso: '2026-07-30T03:00:00.000Z' }),
  })
}

/** 設定から開いた時（記録なし）の mailto URL。入力欄に `note` を書いた状態を作る。 */
function settingsUrl(note: string): string {
  return buildMailtoUrl({
    to: DIAG_REPORT_TO,
    subject: buildDiagReportSubject(ENV),
    body: buildDiagReportBody({ diags: [], env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'settings', note }),
  })
}

describe('diagNotePlaceholder', () => {
  /**
   * 例文は**本文ではなく入力欄のプレースホルダ**に置く。本文に置くと、
   * 誰も読まないうちにパーセントエンコードで3倍に膨らんで mailto の尺を食う。
   */
  it('入口ごとに書き方の手本を変える', () => {
    expect(diagNotePlaceholder('attendance')).toContain('「出席する」')
    expect(diagNotePlaceholder('settings')).toContain('時間割')
    expect(diagNotePlaceholder('settings')).not.toContain('「出席する」')
  })

  it('日付・画面・操作・期待と実際が入った1例になっている（並べず1つを詳しく）', () => {
    for (const source of ['attendance', 'settings'] as const) {
      const ph = diagNotePlaceholder(source)
      expect(ph).toContain('例:')
      expect(ph).toMatch(/\d+\/\d+/)
    }
  })
})

describe('通知の計器の1行（N1 §4.6・T16）', () => {
  const LINE = 'notif att=10 dupe=0 legacy=0 next=09-14T10:30 asg=18 fail=0 open=1'

  it('「■ アプリ・端末」の中、環境の後・書き出しの前に1行で載る', () => {
    const b = buildDiagReportBody({ diags: [], env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'settings', notifLine: LINE })
    expect(b).toContain(`Android 15 / Google Pixel 8\n${LINE}\n書き出し 2026-07-30T03:00:00.000Z`)
  })

  it('渡さなければ今の本文と同じ（既存の入口の回帰なし）', () => {
    const a = buildDiagReportBody({ diags: [], env: ENV, nowIso: 'x', source: 'settings' })
    expect(buildDiagReportBody({ diags: [], env: ENV, nowIso: 'x', source: 'settings', notifLine: null })).toBe(a)
  })

  it('設定から開いた下書き（計器つき・未記入）の mailto は 2,000 字の目安に収まる', () => {
    const url = buildMailtoUrl({
      to: DIAG_REPORT_TO,
      subject: buildDiagReportSubject(ENV),
      body: buildDiagReportBody({ diags: [], env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'settings', notifLine: LINE }),
    })
    expect(url.length).toBeLessThanOrEqual(DIAG_MAILTO_SAFE_LIMIT)
    expect(mailtoMayTruncate(url)).toBe(false)
  })

  it('計器つきでも、50字の状況なら目安に収まる（設定側の主動線は変わらない）', () => {
    const url = buildMailtoUrl({
      to: DIAG_REPORT_TO,
      subject: buildDiagReportSubject(ENV),
      body: buildDiagReportBody({ diags: [], env: ENV, nowIso: '2026-07-30T03:00:00.000Z', source: 'settings', note: 'あ'.repeat(50), notifLine: LINE }),
    })
    expect(mailtoMayTruncate(url)).toBe(false)
  })
})
