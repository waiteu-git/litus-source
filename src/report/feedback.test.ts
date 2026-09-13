import { describe, expect, it } from 'vitest'
import type { SubmitDiag } from '../attendance/submitDiag'
import type { DiagEnv } from './diagReport'
import {
  FEEDBACK_TARGET_LABEL,
  buildFeedbackPreviewText,
  buildFeedbackRequestBody,
  buildFeedbackSubject,
  diagAttachTarget,
  feedbackPlaceholder,
  filterDiagsForTarget,
  formatDiagsText,
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackEnvelope,
} from './feedback'

const ENV: DiagEnv = {
  appVersion: '1.0.3',
  buildNumber: '215',
  releaseStage: 'production',
  os: 'Android',
  osVersion: '15',
  device: 'Google Pixel 9',
}

function diag(over: Partial<SubmitDiag> = {}): SubmitDiag {
  return {
    at: '2026-09-13T02:10:00.000Z',
    courseName: '線形代数1',
    ok: false,
    wrong: false,
    err: false,
    result: '送信しました（下の画面で結果をご確認ください）',
    filled: 4,
    ...over,
  }
}

describe('diagAttachTarget', () => {
  it('出席・リアペのみ診断記録を紐づける', () => {
    expect(diagAttachTarget('attendance')).toBe('attendance')
    expect(diagAttachTarget('reaction')).toBe('reaction')
  })

  it('それ以外（時間割・掲示・ログイン・その他・null）は紐づけない', () => {
    expect(diagAttachTarget('timetable')).toBe(null)
    expect(diagAttachTarget('bulletin')).toBe(null)
    expect(diagAttachTarget('login')).toBe(null)
    expect(diagAttachTarget('other')).toBe(null)
    expect(diagAttachTarget(null)).toBe(null)
  })
})

describe('filterDiagsForTarget', () => {
  const diags = [diag({ kind: 'attendance' }), diag({ kind: 'reaction' }), diag({})]

  it('対象=出席では出席分（kind未設定を含む）だけを返す', () => {
    const result = filterDiagsForTarget(diags, 'attendance')
    expect(result).toHaveLength(2)
    expect(result.every((d) => d.kind !== 'reaction')).toBe(true)
  })

  it('対象=リアペではリアペ分だけを返す', () => {
    const result = filterDiagsForTarget(diags, 'reaction')
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('reaction')
  })

  it('対象=時間割・null では空配列を返す', () => {
    expect(filterDiagsForTarget(diags, 'timetable')).toEqual([])
    expect(filterDiagsForTarget(diags, null)).toEqual([])
  })
})

describe('validateFeedbackDraft', () => {
  it('kind=bugでtarget未選択はエラー', () => {
    const draft: FeedbackDraft = { kind: 'bug', target: null, comment: 'x', email: '' }
    expect(validateFeedbackDraft(draft)).not.toBeNull()
  })

  it('コメント空欄はエラー', () => {
    const draft: FeedbackDraft = { kind: 'request', target: null, comment: '   ', email: '' }
    expect(validateFeedbackDraft(draft)).not.toBeNull()
  })

  it('不正なメール形式はエラー', () => {
    const draft: FeedbackDraft = { kind: 'request', target: null, comment: 'x', email: 'not-an-email' }
    expect(validateFeedbackDraft(draft)).not.toBeNull()
  })

  it('ドット無しのドメインは不正（サーバー側と同じ正規表現）', () => {
    const draft: FeedbackDraft = { kind: 'request', target: null, comment: 'x', email: 'a@b' }
    expect(validateFeedbackDraft(draft)).not.toBeNull()
  })

  it('メール空欄（任意）は許容される', () => {
    const draft: FeedbackDraft = { kind: 'request', target: null, comment: 'x', email: '' }
    expect(validateFeedbackDraft(draft)).toBeNull()
  })

  it('正常系（kind=bug・target選択済み）はnull', () => {
    const draft: FeedbackDraft = { kind: 'bug', target: 'timetable', comment: '水曜が表示されない', email: 'a@example.com' }
    expect(validateFeedbackDraft(draft)).toBeNull()
  })
})

describe('feedbackPlaceholder', () => {
  it('要望はkindだけで決まる（targetを見ない）', () => {
    expect(feedbackPlaceholder('request', null)).toContain('例:')
  })

  it('不具合は対象ごとに違う手本になる', () => {
    expect(feedbackPlaceholder('bug', 'attendance')).not.toBe(feedbackPlaceholder('bug', 'timetable'))
  })
})

describe('buildFeedbackSubject', () => {
  it('種別ごとに件名が変わり、buildを含む', () => {
    expect(buildFeedbackSubject('bug', ENV)).toBe('リタスの不具合報告（build 215）')
    expect(buildFeedbackSubject('request', ENV)).toBe('リタスのご要望（build 215）')
  })

  it('build不明でも件名を作れる', () => {
    expect(buildFeedbackSubject('bug', { ...ENV, buildNumber: null })).toBe('リタスの不具合報告（build ?）')
  })
})

describe('formatDiagsText', () => {
  it('0件はnull', () => {
    expect(formatDiagsText([])).toBe(null)
  })

  it('件数つきで区切って並べる', () => {
    const text = formatDiagsText([diag(), diag()])
    expect(text).toContain('--- 1 ---')
    expect(text).toContain('--- 2 ---')
  })
})

describe('buildFeedbackPreviewText', () => {
  const base: FeedbackEnvelope = {
    kind: 'bug',
    target: 'attendance',
    comment: '出席が反映されません',
    email: null,
    diagsText: null,
    notifLine: null,
    env: ENV,
  }

  it('種別・対象・コメント・環境情報を含む', () => {
    const text = buildFeedbackPreviewText(base)
    expect(text).toContain('不具合報告')
    expect(text).toContain(FEEDBACK_TARGET_LABEL.attendance)
    expect(text).toContain('出席が反映されません')
    expect(text).toContain('Google Pixel 9')
  })

  it('診断記録があれば含み、無ければ含まない', () => {
    expect(buildFeedbackPreviewText(base)).not.toContain('■ 診断記録')
    expect(buildFeedbackPreviewText({ ...base, diagsText: '--- 1 ---\nok=false' })).toContain('■ 診断記録')
  })

  it('メールアドレスがあれば含み、無ければ含まない', () => {
    expect(buildFeedbackPreviewText(base)).not.toContain('返信用メールアドレス')
    expect(buildFeedbackPreviewText({ ...base, email: 'a@example.com' })).toContain('a@example.com')
  })

  it('学籍番号・氏名を本文に入れる経路が無い', () => {
    const text = buildFeedbackPreviewText({ ...base, comment: '普通のコメント' })
    expect(text).not.toMatch(/学籍番号|氏名/)
  })
})

describe('buildFeedbackRequestBody', () => {
  it('APIへ送るJSONの形が正しい', () => {
    const envelope: FeedbackEnvelope = {
      kind: 'request',
      target: null,
      comment: 'ダークモードが欲しいです',
      email: null,
      diagsText: null,
      notifLine: null,
      env: ENV,
    }
    expect(buildFeedbackRequestBody(envelope)).toEqual({
      kind: 'request',
      target: null,
      comment: 'ダークモードが欲しいです',
      email: '',
      diagsText: null,
      notifLine: null,
      env: ENV,
    })
  })
})

describe('パイプライン全体の一貫性（draft→envelope→preview/request）', () => {
  it('複数行コメントが改行を保ったまま両方の出力に残る', () => {
    const comment = '出席が反映されません\n手順:\n1. 開く\n2. 押す'
    const envelope: FeedbackEnvelope = {
      kind: 'bug',
      target: 'attendance',
      comment,
      email: null,
      diagsText: formatDiagsText([]),
      notifLine: null,
      env: ENV,
    }
    expect(buildFeedbackPreviewText(envelope)).toContain(comment)
    expect(buildFeedbackRequestBody(envelope).comment).toBe(comment)
  })

  it('kind=requestではtarget:null・email:""になる', () => {
    const envelope: FeedbackEnvelope = {
      kind: 'request',
      target: null,
      comment: 'x',
      email: null,
      diagsText: null,
      notifLine: null,
      env: ENV,
    }
    const body = buildFeedbackRequestBody(envelope)
    expect(body.target).toBe(null)
    expect(body.email).toBe('')
  })

  it('kind未設定の既存出席記録がkind=attendanceのdiagsTextに載る', () => {
    const diags = [diag({}), diag({ kind: 'reaction' })]
    const filtered = filterDiagsForTarget(diags, 'attendance')
    const text = formatDiagsText(filtered)
    expect(filtered).toHaveLength(1)
    expect(text).not.toBeNull()
  })
})
