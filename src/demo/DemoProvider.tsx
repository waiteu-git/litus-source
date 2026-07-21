/**
 * デモモードの状態を持つ Context。
 *
 * **App.tsx で LoginGate より上位に置くこと。** LoginGate の WebView は
 * showLoginUi に関わらず常時マウントされており（セッション判定 probe を兼ねる）、
 * LoginGate を描画したままではデモ中も大学へ通信してしまう。デモ中は
 * LoginGate 自体をツリーから外すのが「通信ゼロ」の唯一の担保。
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Storage, setDemoNamespace } from '../storage/asyncStorage'
import { DEMO_SEEDED_KEY, shouldSeedDemo } from './demoState'
import { seedDemoData } from './seedDemoData'

type DemoValue = {
  active: boolean
  enter: () => Promise<void>
  exit: () => Promise<void>
}

const DemoContext = createContext<DemoValue>({
  active: false,
  enter: async () => {},
  exit: async () => {},
})

export function useDemo(): DemoValue {
  return useContext(DemoContext)
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)

  const enter = useCallback(async () => {
    // 名前空間を先に切り替える。この後の読み書きはすべて demo: 側へ入り、実データに触れない。
    setDemoNamespace(true)
    const seeded = await Storage.getItem(DEMO_SEEDED_KEY)
    if (shouldSeedDemo(seeded)) {
      await seedDemoData()
      await Storage.setItem(DEMO_SEEDED_KEY, '1')
    }
    setActive(true)
  }, [])

  const exit = useCallback(async () => {
    // デモ名前空間を消してから解除する。順序が逆だと実データを消す。
    await Storage.clearDemoNamespace()
    setDemoNamespace(false)
    setActive(false)
  }, [])

  return <DemoContext.Provider value={{ active, enter, exit }}>{children}</DemoContext.Provider>
}
