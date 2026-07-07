import type { AttendanceReception } from '../collect/attendanceMessage'
import type { ClassPageKind } from './classifyClassPage'

export type EnginePhase = 'booting' | 'ready' | 'needsLogin' | 'navFailed' | 'submitting' | 'result'

export interface SubmitResult {
  result: string
  ok: boolean
  wrong: boolean
  err: boolean
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
  | { kind: 'retry' }

export const initialEngineState: EngineState = { phase: 'booting', reception: null, result: null }

export function overlayVisible(phase: EnginePhase): boolean {
  return phase === 'needsLogin' || phase === 'navFailed'
}

export function attendanceReducer(state: EngineState, event: EngineEvent): EngineState {
  switch (event.kind) {
    case 'page':
      if (event.page === 'login') return { ...state, phase: 'needsLogin' }
      return state
    case 'reception':
      return { ...state, phase: 'ready', reception: event.reception }
    case 'submitStart':
      return { ...state, phase: 'submitting', result: null }
    case 'submitResult':
      return { ...state, phase: 'result', result: event.result }
    case 'navTimeout':
      if (state.phase === 'booting') return { ...state, phase: 'navFailed' }
      return state
    case 'retry':
      return { ...initialEngineState }
    default:
      return state
  }
}
