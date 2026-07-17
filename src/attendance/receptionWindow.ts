/**
 * 出席可能時間（受付時間・"10:20〜12:00"）の正典モジュール（純粋・端末非依存）。
 *
 * 出どころは CLASS 出席ページの `label.signSize`（「出席確認時間：10:20～12:00」）＝
 * parseAttendanceMessage の `reception.confirmWindow`。
 *
 * **なぜ保存してよいか**: confirmWindow は「10:20〜12:00」という**静的な時刻レンジ**なので、
 * 取得した瞬間の値がそのまま後で now と突き合わせて再計算できる＝陳腐化しない。
 * 対して `reception.remaining`（「あと12分」）は**取得時点で固定された静止値**なので保存できない
 * （保存すると減らない「残り時間」になる）。この非対称がホームで受付時間を出せる根拠。
 */
import type { DayOfWeek } from '../parsers/timetable'

export type { DayOfWeek }

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

const p2 = (n: number) => String(n).padStart(2, '0')

export type WindowRange = { startMin: number; endMin: number }

/**
 * 受付時間文字列から開始・終了を分で取る。区切り文字は問わない（`〜`/`～`/`-` いずれも可）。
 * 終了が開始以下（日跨ぎ・壊れ値）は null＝解析不能として扱う（授業の受付は日を跨がない）。
 */
export function parseWindowMinutes(window: string | null | undefined): WindowRange | null {
  if (!window) return null
  const m = window.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const startMin = Number(m[1]) * 60 + Number(m[2])
  const endMin = Number(m[3]) * 60 + Number(m[4])
  if (endMin <= startMin) return null
  if (startMin < 0 || endMin > 24 * 60) return null
  return { startMin, endMin }
}

/** 受付時間の終了を "HH:MM" で返す（表示用）。解析不能は null。 */
export function windowEndText(window: string | null | undefined): string | null {
  const r = parseWindowMinutes(window)
  if (!r) return null
  return `${p2(Math.floor(r.endMin / 60))}:${p2(r.endMin % 60)}`
}

/**
 * その受付時間が「この時限のもの」か。**開始時刻でアンカーする**（now ではない）。
 *
 * now でアンカーすると、2限に取った受付時間が3限にも当たってしまい**別コマの受付時間を
 * 表示する**。開始でアンカーすれば、保存が古くても次のコマでは自然に外れて授業ベースに落ちる
 * ＝**古い保存が無害**になる。これが「保存して使う」設計の安全性の要。
 * 受付は授業開始よりわずかに前から始まる場合があるため前余裕を持たせる（attendedClassEndMin と同じ）。
 */
export function windowAnchorsToPeriod(
  window: string | null | undefined,
  periodStartMin: number,
  periodEndMin: number,
  preMinutes = 10,
): boolean {
  const r = parseWindowMinutes(window)
  if (!r) return false
  return r.startMin >= periodStartMin - preMinutes && r.startMin <= periodEndMin
}

/**
 * 「今日この受付時間を見た」記録。出席済み記録（AttendedRecord）とは別物で、
 * **受付中の段階から**保存する（出席する前にホームで残りを出すため）。
 * 1件だけ持つ: 別コマの受付時間で上書きされても windowAnchorsToPeriod が弾くので無害。
 */
export type ReceptionWindowRecord = {
  /** 記録した日（YYYY-MM-DD・ローカル）。日付が変われば無効。 */
  date: string
  /** 受付時間（"10:20〜12:00"）。 */
  window: string
  courseName: string | null
}

export type HomeRemainKind = 'reception' | 'closed' | 'class'

export type HomeRemain = {
  kind: HomeRemainKind
  /** 数値の左に置く見出し（「受付」「残り」）。closed は数値を持たないので空。 */
  label: string
  /** 残り分（reception=受付終了まで／class=授業終了まで）。closed は null。 */
  minutes: number | null
  /** 右端の補足（「12:00 まで受付」「12:00 終了」）。 */
  endText: string
  /** バーの残り率（0..100）。そのまま width に使う（100→満・0→空）。 */
  remainPct: number
  /** スクリーンリーダー用の全文。 */
  a11yLabel: string
}

export type HeroPeriod = { start: string; end: string; isNow: boolean }

/**
 * ホームの「いまの授業」カード内・残り時間面の表示を決める（純粋）。
 *
 * **なぜ要るか**: 従来は時限の終了までを一律「残り○分」と出しつつ、その面のタップ先は**出席登録**
 * だった。受付が授業より早く閉じる場合（＝通常）、「まだ90分ある」と誤読させる。出席可能時間が
 * 分かっているならそれを出し、分からないなら授業の残りだと**ラベルで明示**する。
 *
 * 保存された受付時間は「今日」かつ「このコマにアンカーできる」ときだけ採用する
 * ＝古い保存・別コマの保存は自動的に無視され、授業ベースへ安全に落ちる。
 */
export function homeRemaining(args: {
  hero: HeroPeriod | null
  saved: ReceptionWindowRecord | null
  today: string
  now: Date
}): HomeRemain | null {
  const { hero, saved, today, now } = args
  if (!hero || !hero.isNow) return null
  const heroStart = hhmmToMin(hero.start)
  const heroEnd = hhmmToMin(hero.end)
  if (heroStart === null || heroEnd === null || heroEnd <= heroStart) return null
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const classRemain = Math.max(0, heroEnd - nowMin)
  const classPct = Math.min(100, Math.max(0, ((heroEnd - nowMin) / (heroEnd - heroStart)) * 100))
  const classFallback: HomeRemain = {
    kind: 'class',
    label: '残り',
    minutes: classRemain,
    endText: `${hero.end} 終了`,
    remainPct: classPct,
    a11yLabel: `授業終了まで残り${classRemain}分・タップで出席登録へ`,
  }

  if (!saved || saved.date !== today) return classFallback
  const w = parseWindowMinutes(saved.window)
  if (!w || !windowAnchorsToPeriod(saved.window, heroStart, heroEnd)) return classFallback

  const endText = `${p2(Math.floor(w.endMin / 60))}:${p2(w.endMin % 60)}`
  if (nowMin >= w.endMin) {
    return {
      kind: 'closed',
      label: '',
      minutes: null,
      endText: `授業は ${hero.end} 終了`,
      remainPct: 0,
      a11yLabel: `出席の受付は${endText}に終了しました・タップで出席画面へ`,
    }
  }
  const remain = Math.max(0, w.endMin - nowMin)
  const pct = Math.min(100, Math.max(0, ((w.endMin - nowMin) / (w.endMin - w.startMin)) * 100))
  return {
    kind: 'reception',
    label: '受付',
    minutes: remain,
    endText: `${endText} まで受付`,
    remainPct: pct,
    a11yLabel: `出席の受付終了まであと${remain}分・タップで出席登録へ`,
  }
}
