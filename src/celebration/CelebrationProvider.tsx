import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  loadCelebrationCardDismissed,
  loadCelebrationChoice,
  saveCelebrationCardDismissed,
  saveCelebrationChoice,
} from '../storage/celebrationStore'
import {
  cardDismissedAfterToggle,
  celebrationState,
  isCelebrationCardVisible,
  type CelebrationChoice,
} from './celebration'

type Ctx = {
  /** 保存値の読み込みが済んだか。済むまでは「出さない」（オフの人に一瞬だけ出る、を避ける）。 */
  ready: boolean
  choice: CelebrationChoice
  /** お祝いデザインを表示するか（見出しの線・起動画面の飾り）。 */
  active: boolean
  /** ホームのカードを出すか。active で、かつ×で閉じていない時。 */
  cardVisible: boolean
  /** 設定に切替の行を出すか。 */
  rowVisible: boolean
  setEnabled: (on: boolean) => void
  /** ホームのカードを×で閉じる（保存して、次の起動でも閉じたまま）。 */
  dismissCard: () => void
}

const DEFAULT: Ctx = {
  ready: false,
  choice: null,
  active: false,
  cardVisible: false,
  rowVisible: false,
  setEnabled: () => {},
  dismissCard: () => {},
}

const CelebrationContext = createContext<Ctx>(DEFAULT)

/**
 * お祝いデザインの選択をアプリ全体で共有・永続化する（displaySettings.tsx の DisplaySettingsProvider と同じ形）。
 * 未選択は「期間内ならオン」（celebration.ts）。LoginGate はこの Provider の**内側**にいる。起動の最初の描画だけは
 * Provider の読み込み（非同期）より先に要るので store を直接読み、Provider が ready になったらこちらの値に従う
 * （設定の切替が、同じプロセスで再ログインの起動画面にも届く）。
 * ホームのカードの「×で閉じた」記録は選択とは別（閉じても起動画面・見出しの線は設定どおり）。
 * 設定でオフ→オンへ戻した時だけ、閉じた記録を消す（cardDismissedAfterToggle）。
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<CelebrationChoice>(null)
  const [cardDismissed, setCardDismissed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // どちらの load も投げない（読めない時は 未選択／閉じていない）。
    Promise.all([loadCelebrationChoice(), loadCelebrationCardDismissed()])
      .then(([c, d]) => {
        setChoice(c)
        setCardDismissed(d)
      })
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])

  function setEnabled(on: boolean) {
    const next = on ? 'on' : 'off'
    const nextDismissed = cardDismissedAfterToggle(choice, on, cardDismissed)
    setChoice(next)
    saveCelebrationChoice(next).catch(() => undefined)
    if (nextDismissed !== cardDismissed) {
      setCardDismissed(nextDismissed)
      saveCelebrationCardDismissed(nextDismissed).catch(() => undefined)
    }
  }

  function dismissCard() {
    setCardDismissed(true)
    saveCelebrationCardDismissed(true).catch(() => undefined)
  }

  const { active, rowVisible } = celebrationState(ready, choice, new Date())
  const cardVisible = isCelebrationCardVisible(active, cardDismissed)
  return (
    <CelebrationContext.Provider value={{ ready, choice, active, cardVisible, rowVisible, setEnabled, dismissCard }}>
      {children}
    </CelebrationContext.Provider>
  )
}

export function useCelebration(): Ctx {
  return useContext(CelebrationContext)
}
