import {
  OPEN_BULLETIN_JS,
  GO_BULLETIN_JS,
  COLLECT_BULLETIN_TABS_JS,
  COLLECT_BULLETIN_DETAIL_JS,
  openBulletinDetailJs,
  setBulletinFlagJs,
} from './injectedScripts'
import { parseBulletinList, toBulletinItems } from '../parsers/bulletin'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import {
  loadBulletinDigest,
  saveBulletinDigest,
  updateBulletinItem,
} from '../storage/bulletinDigestStore'
import { mergeBulletinItems } from '../storage/bulletinDigestSerialize'
import ClassHeadlessCollector from './ClassHeadlessCollector'

type Props = {
  action: 'openDetail' | 'setFlag'
  title: string
  date: string
  onFinished: () => void
}

/**
 * 掲示1件への headless アクション。
 * - openDetail: 対象の掲示内容モーダルを開いて本文を取得し、ローカルを既読化＋body保存。
 * - setFlag: 対象行のフラグを切替え、2タブを再収集して最新状態をマージ保存。
 * どちらも 1 セッション 1 アクション（ViewState保護）。
 */
export default function BulletinActionEngine({ action, title, date, onFinished }: Props) {
  const id = `${date}::${title}`

  if (action === 'openDetail') {
    return (
      <ClassHeadlessCollector
        openJs={OPEN_BULLETIN_JS}
        actionJs={openBulletinDetailJs(title, date)}
        collectJs={COLLECT_BULLETIN_DETAIL_JS}
        resultType="bulletinDetail"
        fallbackJs={GO_BULLETIN_JS}
        onData={async (raw) => {
          let p: { html?: string; ready?: boolean } | null = null
          try {
            p = JSON.parse(raw)
          } catch {
            return false
          }
          if (!p || !p.ready || !p.html) return false
          const body = parseBulletinDetail(p.html)
          if (!body) return false
          await updateBulletinItem(id, (i) => ({ ...i, body, unread: false }))
          return true
        }}
        onFinished={onFinished}
      />
    )
  }

  // setFlag
  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      actionJs={setBulletinFlagJs(title, date)}
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
        const rows = [
          ...parseBulletinList(p.unreadHtml ?? ''),
          ...parseBulletinList(p.flaggedHtml ?? ''),
        ]
        const prev = await loadBulletinDigest()
        await saveBulletinDigest(mergeBulletinItems(prev, toBulletinItems(rows)))
        return true
      }}
      onFinished={onFinished}
    />
  )
}
