import { COLLECT_BULLETIN_JS, GO_BULLETIN_JS, OPEN_BULLETIN_JS } from './injectedScripts'
import { parseBulletinList, toBulletinItems } from '../parsers/bulletin'
import { saveBulletinDigest } from '../storage/bulletinDigestStore'
import { saveBulletinRefreshedAt } from '../storage/refreshMetaStore'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS掲示一覧の headless 収集エンジン。共有骨格 ClassHeadlessCollector に掲示板用の
 * メニュー発火JS・抽出JS・保存処理を差し込んだ薄いラッパ。着地ページはログイン時刻で変わる
 * （アンケート/ホーム/授業中は出席）ため、着地に頼らず常設メニューから必ず遷移する。
 * dl.keiji を1件以上取れた時だけ保存し、取れない時は既存ダイジェストを消さない。
 */
export default function BulletinSyncEngine({ onFinished }: { onFinished: () => void }) {
  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      collectJs={COLLECT_BULLETIN_JS}
      resultType="bulletin"
      fallbackJs={GO_BULLETIN_JS}
      onData={async (raw) => {
        let p: { count?: number; html?: string } | null = null
        try {
          p = JSON.parse(raw)
        } catch {
          return false
        }
        // dl.keiji を1件以上取れた＝掲示板ページに到達。抽出して保存。
        if (!p || typeof p.count !== 'number' || p.count <= 0 || typeof p.html !== 'string') return false
        try {
          const digest = toBulletinItems(parseBulletinList(p.html))
          await saveBulletinDigest(digest)
          await saveBulletinRefreshedAt()
        } catch {
          // 保存失敗でも完了扱い（次回再試行）。到達はしているので false で無駄打ちしない。
        }
        return true
      }}
      onFinished={onFinished}
    />
  )
}
