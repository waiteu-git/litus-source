import { useEffect, useRef } from 'react'
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
  mutateBulletinDigest,
  updateBulletinItem,
  saveBulletinDetailDiag,
} from '../storage/bulletinDigestStore'
import { mergeBulletinItems } from '../storage/bulletinDigestSerialize'
import ClassHeadlessCollector from './ClassHeadlessCollector'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'

type Props = {
  action: 'openDetail' | 'setFlag'
  title: string
  date: string
  /** setFlag のとき、合わせたいフラグ状態（true=付ける）。省略時は true。 */
  desiredFlag?: boolean
  onFinished: () => void
}

/**
 * 掲示1件への headless アクション。
 * - openDetail: 対象の掲示内容モーダルを開いて本文を取得し、ローカルを既読化＋body保存。
 * - setFlag: 対象行のフラグを切替え、2タブを再収集して最新状態をマージ保存。
 * どちらも 1 セッション 1 アクション（ViewState保護）。
 */
export default function BulletinActionEngine({ action, title, date, desiredFlag, onFinished }: Props) {
  // CLASS帯 or オフラインでは掲示アクションは不成立。WebViewを起こさず即終了し、次回操作/収集に委ねる。
  const blocked = !evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() }).allowed
  useEffect(() => {
    if (blocked) onFinished()
  }, [blocked, onFinished])
  if (blocked) return null

  const id = `${date}::${title}`
  const diag = useRef({ page: '', stage: '', panel: 0, plen: 0, got: false })

  if (action === 'openDetail') {
    return (
      <ClassHeadlessCollector
        openJs={OPEN_BULLETIN_JS}
        actionJs={openBulletinDetailJs(title, date)}
        collectJs={COLLECT_BULLETIN_DETAIL_JS}
        resultType="bulletinDetail"
        fallbackJs={GO_BULLETIN_JS}
        onSignal={(p) => {
          if (p.type === 'page' && typeof p.url === 'string') diag.current.page = (p.url.split('/').pop() as string) || ''
          if (p.type === 'nav' && typeof p.stage === 'string') diag.current.stage = p.stage as string
          if (p.type === 'bulletinDetail') {
            if (typeof p.panel === 'number') diag.current.panel = p.panel
            if (typeof p.plen === 'number') diag.current.plen = p.plen
          }
        }}
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
          diag.current.got = true
          return true
        }}
        onFinished={() => {
          if (__DEV__) {
            const d = diag.current
            saveBulletinDetailDiag(
              `page=${d.page || '?'} stage=${d.stage || '?'} panel=${d.panel} plen=${d.plen} got=${d.got}`,
            ).catch(() => undefined)
          }
          onFinished()
        }}
      />
    )
  }

  // setFlag
  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      actionJs={setBulletinFlagJs(title, date, desiredFlag ?? true)}
      collectJs={COLLECT_BULLETIN_TABS_JS}
      resultType="bulletin"
      fallbackJs={GO_BULLETIN_JS}
      onData={async (raw) => {
        let p: { count?: number; html?: string } | null = null
        try {
          p = JSON.parse(raw)
        } catch {
          return false
        }
        if (!p || typeof p.count !== 'number' || p.count <= 0) return false
        const rows = parseBulletinList(p.html ?? '')
        if (rows.length === 0) return false
        await mutateBulletinDigest((prev) => mergeBulletinItems(prev, toBulletinItems(rows)))
        return true
      }}
      onFinished={onFinished}
    />
  )
}
