/**
 * 自己診断台帳（DiagnosticsState・T4）の live 購読ストア（spec§7・T6）。
 *
 * LTW は popup が開くたび chrome.storage から読み、chrome.storage.onChanged で live 更新する。
 * Litus（RN）に onChanged 相当は無いので、薄い Context ストアで等価物を作る:
 *
 * - マウント時に loadDiagnosticsState() で一度読む。
 * - スキャン完了時、収集エンジン（LetusSyncEngine.finish）が recordScanCycleOutcome の
 *   解決値を applyState(next) で push する（storage を読み直さず、確定済みの state をそのまま反映）。
 *   これで課題タブ/ホームを開きっぱなしでもバナーが live 更新される。
 * - デモの出入りで名前空間が切り替わるため、useDemo().active の変化で必ず読み直す
 *   （デモは demo: 名前空間＝実診断が空に見える／退場で実データへ戻す）。UI 側（DiagnosticsBanner）も
 *   デモ中は描かないが、ストア値自体もデモ名前空間に追随させて二重に漏れを塞ぐ。
 *
 * approach: spec§7 が挙げた「(a) 同期完了時に読み直す / (b) 薄い version ストアを足して購読」の
 * うち (b) 系。ただし version カウンタでなく確定 state そのものを保持する（バナーは state を要るため、
 * カウンタ→再 load の1往復を省ける。sync 側が既に解決済みの state を持っているので素直）。
 *
 * AsyncStorage / fetch には直接触れない: 読みは storage 配線（loadDiagnosticsState）に委譲する。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DiagnosticsState } from './diagnosticsState'
import type { StoredMoodleFingerprint } from './moodleFingerprint'
import { loadDiagnosticsState } from '../storage/diagnosticsStateStore'
import { loadMoodleFingerprint } from '../storage/moodleFingerprintStore'
import { useDemo } from '../demo/DemoProvider'

type DiagnosticsValue = {
  /** 現在の診断台帳（未スキャン/未ロードは null）。 */
  state: DiagnosticsState | null
  /** 受動版フィンガープリントの最新観測（未観測は null・§9/T8）。 */
  fingerprint: StoredMoodleFingerprint | null
  /** スキャン確定時に収集エンジンが呼ぶ。解決済み state をそのまま反映する。 */
  applyState: (next: DiagnosticsState | null) => void
  /** storage から読み直す（デモ出入り・フォアグラウンド復帰など）。 */
  refresh: () => void
}

// Provider 外（テスト等）は中立: state=null・push/refresh は no-op。
const Ctx = createContext<DiagnosticsValue>({
  state: null,
  fingerprint: null,
  applyState: () => {},
  refresh: () => {},
})

export function useDiagnostics(): DiagnosticsValue {
  return useContext(Ctx)
}

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DiagnosticsState | null>(null)
  const [fingerprint, setFingerprint] = useState<StoredMoodleFingerprint | null>(null)
  const { active: demo } = useDemo()

  // 最新の非同期 load だけを反映するためのガード（デモ連打で古い読みが後着しても捨てる）。
  const loadSeq = useRef(0)
  // フィンガープリントは台帳と別キーだが、読み直す契機（マウント・デモ切替・スキャン確定）は同じ。
  // 台帳と同じ seq でガードすると push（applyState）が seq を進めた直後の読みが捨てられてしまうため、
  // 専用の seq を持つ（フィンガープリントには push 経路が無く、常に storage が真実）。
  const fpSeq = useRef(0)
  const refreshFingerprint = useCallback(() => {
    const seq = ++fpSeq.current
    loadMoodleFingerprint()
      .then((fp) => {
        if (seq === fpSeq.current) setFingerprint(fp)
      })
      .catch(() => {
        if (seq === fpSeq.current) setFingerprint(null)
      })
  }, [])
  const refresh = useCallback(() => {
    const seq = ++loadSeq.current
    loadDiagnosticsState()
      .then((s) => {
        if (seq === loadSeq.current) setState(s)
      })
      .catch(() => {
        if (seq === loadSeq.current) setState(null)
      })
    refreshFingerprint()
  }, [refreshFingerprint])

  // マウント時＋デモ名前空間の切り替え時に読み直す。demo 変化時は asyncStorage 側の
  // setDemoNamespace が先に走っている（DemoProvider は名前空間切替→active 反映の順）ので、
  // ここでの load は正しい名前空間を読む。
  useEffect(() => {
    refresh()
  }, [refresh, demo])

  const applyState = useCallback(
    (next: DiagnosticsState | null) => {
      // load の後着で上書きされないよう、push も seq を進める（push が最新の真実）。
      loadSeq.current++
      setState(next)
      // フィンガープリントには push 経路が無い（収集エンジンは台帳しか返さない）が、同じサイクルの
      // 記録エントリ（recordScanCycleOutcome）が台帳より先に保存を終えている。ここで読み直せば
      // 版が変わったスキャンの直後にノートが live 反映される（LTW の storage.onChanged 相当）。
      refreshFingerprint()
    },
    [refreshFingerprint],
  )

  const value = useMemo<DiagnosticsValue>(
    () => ({ state, fingerprint, applyState, refresh }),
    [state, fingerprint, applyState, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
