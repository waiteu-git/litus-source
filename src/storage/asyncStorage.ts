/**
 * AsyncStorage への唯一の出口。デモモード時はキーを `demo:` 名前空間へ振り替える。
 *
 * なぜファサードが要るか: ストア審査（App Store 2.1 / Play アプリのアクセス権）のために
 * ログイン不要のデモモードが必要だが、実ユーザーがデモに入ったとき実データを1バイトも
 * 壊してはならない。名前空間を分けることで、デモ中の書き込みは物理的に別キーへ入り、
 * デモを抜ければ実データがそのまま残る。「退避→投入→復元」方式は復元前クラッシュで
 * 実データを失うため採らない。
 *
 * ストア層（src/storage/*Store.ts）は必ずここを経由すること。直接 AsyncStorage を
 * import すると名前空間を迂回してデモ中に実データを壊す。ラチェットテストで禁止している。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export const DEMO_PREFIX = 'demo:'

// モジュールレベルの可変状態。ウィジェットのヘッドレスタスクは別プロセス起動で
// このフラグが false のまま＝実データを読む。デモ中にウィジェットが実データを
// 表示するだけで、デモデータが実ウィジェットに漏れることはない（安全側）。
let demoActive = false

/** デモ名前空間の ON/OFF。DemoProvider からのみ呼ぶ。 */
export function setDemoNamespace(on: boolean): void {
  demoActive = on
}

export function isDemoNamespace(): boolean {
  return demoActive
}

/** 現在の名前空間に応じたキーを返す。二重前置はしない。 */
export function demoKey(key: string): string {
  if (!demoActive) return key
  return key.startsWith(DEMO_PREFIX) ? key : `${DEMO_PREFIX}${key}`
}

export const Storage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(demoKey(key)),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(demoKey(key), value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(demoKey(key)),

  /** 全消去（実データ・デモ両方）。resetAll からのみ呼ぶ。 */
  clearAll: (): Promise<void> => AsyncStorage.clear(),

  /** デモ名前空間のキーだけ消す。実データには触れない。 */
  clearDemoNamespace: async (): Promise<void> => {
    const keys = await AsyncStorage.getAllKeys()
    const demoKeys = keys.filter((k) => k.startsWith(DEMO_PREFIX))
    if (demoKeys.length > 0) await AsyncStorage.multiRemove(demoKeys)
  },
}
