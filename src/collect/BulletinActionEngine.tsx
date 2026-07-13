import { useEffect, useRef } from 'react'
import {
  OPEN_BULLETIN_JS,
  GO_BULLETIN_JS,
  COLLECT_BULLETIN_DETAIL_JS,
  openBulletinDetailJs,
  setBulletinFlagJs,
} from './injectedScripts'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { updateBulletinItem, saveBulletinDetailDiag } from '../storage/bulletinDigestStore'
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
 * - setFlag: 対象行のフラグを切替え、ソースで反映を確認してからローカルのフラグを直接更新。
 * どちらも 1 セッション 1 アクション（ViewState保護）。
 */
export default function BulletinActionEngine({ action, title, date, desiredFlag, onFinished }: Props) {
  const id = `${date}::${title}`
  const diag = useRef({ page: '', stage: '', panel: 0, plen: 0, got: false })
  // CLASS帯 or オフラインでは掲示アクションは不成立。WebViewを起こさず即終了し、次回操作/収集に委ねる。
  const blocked = !evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() }).allowed
  useEffect(() => {
    if (blocked) onFinished()
  }, [blocked, onFinished])
  if (blocked) return null

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
          let p: { html?: string; ready?: boolean; readDone?: boolean } | null = null
          try {
            p = JSON.parse(raw)
          } catch {
            return false
          }
          if (!p || !p.ready || !p.html) return false
          const body = parseBulletinDetail(p.html)
          if (!body) return false
          // 既読処理の完了(readDone)も待ってから確定する。重要/新着掲示はモーダル開きだけでは
          // CLASS既読にならず openBulletinDetailJs が明示トグルするため、その反映前に WebView を畳むと
          // 既読AJAXが中断される。readDone=本文取得済み＋既読処理完了 の両立で完了扱いにする。
          if (!p.readDone) return false
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

  // setFlag: フラグ切替のJS自身がソースで反映を確認して結果(bulletinFlag)を返す（openDetailが本文出現で
  // 完了を確認するのと同じく、アクションの効果を待つ）。反映確認できたらローカルのフラグを直接 want に設定する
  // ＝多タブの古いDOMを再収集して読み戻さない（旧実装は収集がトグルAJAXに先着し古い flagged=false のまま確定
  // していた＝フラグが全体で効かない真因）。冪等JSなので再注入・再抽出でも二重トグルしない。
  const want = desiredFlag ?? true
  return (
    <ClassHeadlessCollector
      openJs={OPEN_BULLETIN_JS}
      collectJs={setBulletinFlagJs(title, date, want)}
      resultType="bulletinFlag"
      fallbackJs={GO_BULLETIN_JS}
      onSignal={(p) => {
        if (p.type === 'page' && typeof p.url === 'string') diag.current.page = (p.url.split('/').pop() as string) || ''
        if (p.type === 'bulletinFlag' && typeof p.stage === 'string') diag.current.stage = p.stage as string
      }}
      onData={async (raw) => {
        let p: { ok?: boolean } | null = null
        try {
          p = JSON.parse(raw)
        } catch {
          return false
        }
        if (!p || p.ok !== true) return false // 未反映/行欠落 → 再抽出（冪等なのでトグルは重複しない）
        await updateBulletinItem(id, (i) => ({ ...i, flagged: want }))
        diag.current.got = true
        return true
      }}
      onFinished={() => {
        if (__DEV__) {
          const d = diag.current
          saveBulletinDetailDiag(`flag page=${d.page || '?'} stage=${d.stage || '?'} got=${d.got}`).catch(
            () => undefined,
          )
        }
        onFinished()
      }}
    />
  )
}
