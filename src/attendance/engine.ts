import type { AttendanceReception } from '../collect/attendanceMessage'
import type { ClassPageKind } from './classifyClassPage'

export type EnginePhase = 'booting' | 'ready' | 'needsLogin' | 'navFailed' | 'submitting' | 'result'

export interface SubmitResult {
  result: string
  ok: boolean
  wrong: boolean
  err: boolean
  /**
   * 「出席登録する」ボタンを掴めたか（actuator診断）。false＝そもそもJSFへ送信していない。
   * ok/wrong/err が全て false でも送信失敗と確定できる唯一の手がかりなので捨てないこと
   * （[[submitOutcome]] が失敗判定に使う）。省略時（旧データ）は未知として扱う。
   */
  btnFound?: boolean
  /** 送信呼び出しの経路（'onclick' | 'click' | 'click-fb' | 'none' | 'err'）。実機診断用。 */
  method?: string
}

export interface EngineState {
  phase: EnginePhase
  reception: AttendanceReception | null
  result: SubmitResult | null
}

export type EngineEvent =
  | { kind: 'page'; page: ClassPageKind }
  | { kind: 'reception'; reception: AttendanceReception }
  | { kind: 'submitStart' }
  | { kind: 'submitResult'; result: SubmitResult }
  | { kind: 'navTimeout' }
  | { kind: 'errorPage' }
  | { kind: 'reboot' }
  | { kind: 'retry' }

export const initialEngineState: EngineState = { phase: 'booting', reception: null, result: null }

export function overlayVisible(phase: EnginePhase): boolean {
  return phase === 'needsLogin' || phase === 'navFailed'
}

export function attendanceReducer(state: EngineState, event: EngineEvent): EngineState {
  switch (event.kind) {
    case 'page':
      if (event.page === 'login') return { ...state, phase: 'needsLogin' }
      // 要ログイン/遷移失敗から非ログインページを検知したら通常フロー(booting)へ復帰
      if (state.phase === 'needsLogin' || state.phase === 'navFailed') return { ...state, phase: 'booting' }
      return state
    case 'reception':
      // 送信結果表示中/送信中は結果を消さないよう phase を維持し、受付状況だけ更新
      if (state.phase === 'result' || state.phase === 'submitting')
        return { ...state, reception: event.reception }
      return { ...state, phase: 'ready', reception: event.reception }
    case 'submitStart':
      return { ...state, phase: 'submitting', result: null }
    case 'submitResult':
      return { ...state, phase: 'result', result: event.result }
    case 'navTimeout':
      if (state.phase === 'booting') return { ...state, phase: 'navFailed' }
      return state
    case 'errorPage':
      // システムエラーページで自動復帰を使い切った後の最終フォールバック（手動やり直しへ）
      return { ...state, phase: 'navFailed' }
    case 'reboot':
      // タブ再訪などのWebView再起動。前回の受付状況をキャッシュ表示するため reception は保持する
      return { ...state, phase: 'booting', result: null }
    case 'retry':
      return { ...initialEngineState }
    default:
      return state
  }
}
