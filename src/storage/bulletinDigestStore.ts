import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeBulletinDigest,
  deserializeBulletinDigest,
  type BulletinItem,
} from './bulletinDigestSerialize'

const KEY = 'info.bulletinDigest.v1' // キーは据置（deserialize が v1/v2 両対応）

export async function saveBulletinDigest(items: BulletinItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeBulletinDigest(items))
}

export async function loadBulletinDigest(): Promise<BulletinItem[]> {
  return deserializeBulletinDigest(await AsyncStorage.getItem(KEY))
}

const DIAG_KEY = 'info.bulletinDiag.v1'

/** 掲示収集の診断（着地ページ・dl.keiji件数・.alignRight件数）を保存する。取得不能の切り分け用（開発ビルド限定で読み書き）。 */
export async function saveBulletinDiag(text: string): Promise<void> {
  await AsyncStorage.setItem(DIAG_KEY, text)
}

export async function loadBulletinDiag(): Promise<string> {
  return (await AsyncStorage.getItem(DIAG_KEY)) ?? ''
}

const DETAIL_DIAG_KEY = 'info.bulletinDetailDiag.v1'

/** 本文取得の診断（着地/行探索/モーダル状態）。詳細画面の失敗表示に使う（開発ビルド限定で読み書き）。 */
export async function saveBulletinDetailDiag(text: string): Promise<void> {
  await AsyncStorage.setItem(DETAIL_DIAG_KEY, text)
}

export async function loadBulletinDetailDiag(): Promise<string> {
  return (await AsyncStorage.getItem(DETAIL_DIAG_KEY)) ?? ''
}

/** 単一項目を読み書きで更新（body付与・既読化・フラグ更新の永続化に使う）。更新後の全件を返す。 */
export async function updateBulletinItem(
  id: string,
  patch: (i: BulletinItem) => BulletinItem,
): Promise<BulletinItem[]> {
  const items = await loadBulletinDigest()
  const next = items.map((i) => (i.id === id ? patch(i) : i))
  await saveBulletinDigest(next)
  return next
}
