import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'tutorial.dismissedHints.v1'

/** 閉じられたヒントカードのキー集合（壊れ値は空＝再表示に倒す）。 */
export async function loadDismissedHints(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export async function saveDismissedHints(keys: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(keys))
}

/** 設定「ヒントを再表示」用。全ヒントを未クローズへ戻す。 */
export async function clearDismissedHints(): Promise<void> {
  await AsyncStorage.removeItem(KEY)
}
