import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeBulletinDigest,
  deserializeBulletinDigest,
  type BulletinItem,
} from './bulletinDigestSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'info.bulletinDigest.v1' // キーは据置（deserialize が v1/v2 両対応）

// 単一ライタ: 既読化（詳細画面）と背景収集のマージ保存が並走してもlost updateしない。
const enqueueWrite = createWriteQueue()

export async function loadBulletinDigest(): Promise<BulletinItem[]> {
  return deserializeBulletinDigest(await AsyncStorage.getItem(KEY))
}

/**
 * read-modify-writeを直列キュー内で行う（lost update防止の唯一の更新入口）。
 * 呼び出し元でload→save分割せず、必ずこの経路で更新すること。更新後の全件を返す。
 */
export async function mutateBulletinDigest(
  mutate: (items: BulletinItem[]) => BulletinItem[],
): Promise<BulletinItem[]> {
  return enqueueWrite(async () => {
    const next = mutate(await loadBulletinDigest())
    await AsyncStorage.setItem(KEY, serializeBulletinDigest(next))
    return next
  })
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
  return mutateBulletinDigest((items) => items.map((i) => (i.id === id ? patch(i) : i)))
}
