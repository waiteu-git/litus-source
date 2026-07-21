/**
 * デモモードの状態を持つ Context。
 *
 * **App.tsx で LoginGate より上位に置くこと。** LoginGate の WebView は
 * showLoginUi に関わらず常時マウントされており（セッション判定 probe を兼ねる）、
 * LoginGate を描画したままではデモ中も大学へ通信してしまう。デモ中は
 * LoginGate 自体をツリーから外すのが「通信ゼロ」の唯一の担保。
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
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

  // 多重起動ガード。連打すると seedDemoData の read-modify-write が競合してシードが欠ける。
  const busyRef = useRef(false)

  const enter = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    // 名前空間を先に切り替える。この後の読み書きはすべて demo: 側へ入り、実データに触れない。
    setDemoNamespace(true)
    try {
      const seeded = await Storage.getItem(DEMO_SEEDED_KEY)
      if (shouldSeedDemo(seeded)) {
        await seedDemoData()
        await Storage.setItem(DEMO_SEEDED_KEY, '1')
      }
      setActive(true)
    } catch (e) {
      // 失敗したら必ず実データ側へ戻す。フラグが true のまま残ると、UIは非デモなのに
      // ストレージI/Oだけが demo: を向き、実データが全部空に見える（規約未同意扱いになり、
      // 以後の収集結果も demo: 側へ書かれて実データが更新されなくなる）。
      setDemoNamespace(false)
      setActive(false)
      console.warn('デモモードを開始できませんでした', e)
    } finally {
      busyRef.current = false
    }
  }, [])

  const exit = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    // 順序が重要: 先にツリーを落としてから名前空間を戻す。
    // 逆にすると、デモ画面の read-modify-write（mutateAssignments 等）が
    // 「デモ値を getItem 済み → フラグ解除 → 実キーへ setItem」となり、
    // 実ユーザーの課題一覧が架空データに置き換わる。
    setActive(false)
    setDemoNamespace(false)
    try {
      await Storage.clearDemoNamespace()
    } catch (e) {
      // 消し残しは次回 enter で再利用されるだけで無害。ここで throw して
      // 「終了が効かない」状態にする方が悪い。
      console.warn('デモデータの後片付けに失敗しました', e)
    } finally {
      busyRef.current = false
    }
  }, [])

  return <DemoContext.Provider value={{ active, enter, exit }}>{children}</DemoContext.Provider>
}
