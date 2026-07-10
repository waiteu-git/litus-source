import { COLLECT_BULLETIN_TABS_JS, GO_BULLETIN_JS, OPEN_BULLETIN_JS } from './injectedScripts'
import { parseBulletinList, toBulletinItems } from '../parsers/bulletin'
import { loadBulletinDigest, saveBulletinDigest } from '../storage/bulletinDigestStore'
import { mergeBulletinItems } from '../storage/bulletinDigestSerialize'
import { saveBulletinRefreshedAt } from '../storage/refreshMetaStore'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS掲示の headless 収集エンジン。未読(index5)＋フラグつき(index9)の2タブを収集し、
 * 既存の body キャッシュを保ってマージ保存する（フラグ付き既読も保持）。着地に頼らず常設メニューから遷移。
 * 行を1件以上取れた時だけ保存し、0件時は既存を消さない。
 */
export default function BulletinSyncEngine({ onFinished }: { onFinished: () => void }) {
  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      collectJs={COLLECT_BULLETIN_TABS_JS}
      resultType="bulletin"
      fallbackJs={GO_BULLETIN_JS}
      onData={async (raw) => {
        let p: { count?: number; unreadHtml?: string; flaggedHtml?: string } | null = null
        try {
          p = JSON.parse(raw)
        } catch {
          return false
        }
        if (!p || typeof p.count !== 'number' || p.count <= 0) return false
        try {
          const rows = [
            ...parseBulletinList(p.unreadHtml ?? ''),
            ...parseBulletinList(p.flaggedHtml ?? ''),
          ]
          const incoming = toBulletinItems(rows)
          const prev = await loadBulletinDigest()
          await saveBulletinDigest(mergeBulletinItems(prev, incoming))
          await saveBulletinRefreshedAt()
        } catch {
          // 保存失敗でも到達済みなので完了扱い（次回再試行）。
        }
        return true
      }}
      onFinished={onFinished}
    />
  )
}
