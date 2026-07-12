import { useRef } from 'react'
import { COLLECT_BULLETIN_TABS_JS, GO_BULLETIN_JS, OPEN_BULLETIN_JS } from './injectedScripts'
import { parseBulletinList, toBulletinItems } from '../parsers/bulletin'
import { loadBulletinDigest, saveBulletinDigest, saveBulletinDiag } from '../storage/bulletinDigestStore'
import { mergeBulletinItems } from '../storage/bulletinDigestSerialize'
import { saveBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { saveCollectionHealth } from '../storage/collectionHealthStore'
import {
  bulletinHealth,
  createHealthObservation,
  observePageSignal,
  type BulletinCollectDiag,
} from '../health/collectionSignals'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS掲示の headless 収集エンジン。ページ内の全掲示行を収集し、既存の body キャッシュを保って
 * マージ保存する（フラグ付き既読も保持）。着地に頼らず常設メニューから遷移。行を1件以上取れた時だけ保存。
 * 診断: 収集結果が無くても、最後に見たページ種別/nav段階/keiji件数を saveBulletinDiag に残し、
 * ホームで「なぜ取得できないか」を切り分けられるようにする（開発ビルド限定）。
 * ヘルス(層2): 観測シグナルから ok/empty_valid/structure_drift 等を分類し、finish 時に保存する（層1バナー用）。
 */
export default function BulletinSyncEngine({ onFinished }: { onFinished: () => void }) {
  // 最後に観測したシグナル（診断用）。ページ未到達でも finish 時に書き出す。
  const diag = useRef({ page: '', stage: '', keiji: 0, align: 0, rows: 0, got: false, tab: 0, pwd: 0, logout: 0, blen: 0, hlen: 0, fr: 0 })
  // ヘルス判定用の観測（pageシグナル累積＋最終collectペイロード＋最終パース件数）。
  const obs = useRef(createHealthObservation())
  const lastCollect = useRef<BulletinCollectDiag | null>(null)
  const parsedCount = useRef(0)

  const flushDiag = () => {
    if (!__DEV__) return // 診断文字列は開発ビルド限定（一般ユーザーには表示も保存もしない）
    const d = diag.current
    saveBulletinDiag(
      `page=${d.page || '?'} stage=${d.stage || '?'} keiji=${d.keiji} rows=${d.rows} fr=${d.fr} tab=${d.tab} pwd=${d.pwd} logout=${d.logout} blen=${d.blen} hlen=${d.hlen} got=${d.got}`,
    ).catch(() => undefined)
  }

  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      collectJs={COLLECT_BULLETIN_TABS_JS}
      resultType="bulletin"
      fallbackJs={GO_BULLETIN_JS}
      navOnce

      onSignal={(p) => {
        observePageSignal(obs.current, p)
        if (p.type === 'page' && typeof p.url === 'string') {
          diag.current.page = (p.url.split('/').pop() as string) || p.url
        }
        if (p.type === 'nav' && typeof p.stage === 'string') diag.current.stage = p.stage as string
        if (p.type === 'bulletin') {
          if (typeof p.count === 'number') diag.current.keiji = p.count
          if (typeof p.align === 'number') diag.current.align = p.align
          if (typeof p.page === 'string' && p.page) diag.current.page = p.page as string
          if (typeof p.tab === 'number') diag.current.tab = p.tab
          if (typeof p.pwd === 'number') diag.current.pwd = p.pwd
          if (typeof p.logout === 'number') diag.current.logout = p.logout
          if (typeof p.blen === 'number') diag.current.blen = p.blen
          if (typeof p.hlen === 'number') diag.current.hlen = p.hlen
          if (typeof p.fr === 'number') diag.current.fr = p.fr
          lastCollect.current = p as BulletinCollectDiag
        }
      }}
      onData={async (raw) => {
        let p: { count?: number; html?: string; align?: number; page?: string } | null = null
        try {
          p = JSON.parse(raw)
        } catch {
          return false
        }
        const rows0 = parseBulletinList(p?.html ?? '')
        diag.current.rows = rows0.length
        parsedCount.current = rows0.length
        if (!p || typeof p.count !== 'number' || p.count <= 0) return false
        if (rows0.length === 0) return false
        try {
          const incoming = toBulletinItems(rows0)
          const prev = await loadBulletinDigest()
          await saveBulletinDigest(mergeBulletinItems(prev, incoming))
          await saveBulletinRefreshedAt()
          diag.current.got = true
        } catch {
          // 保存失敗でも到達済みなので完了扱い（次回再試行）。
        }
        return true
      }}
      onFinished={() => {
        saveCollectionHealth('bulletin', bulletinHealth(obs.current, lastCollect.current, parsedCount.current)).catch(
          () => undefined,
        )
        flushDiag()
        onFinished()
      }}
    />
  )
}
