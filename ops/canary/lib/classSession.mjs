// CLASS(JSF/Shibboleth) の入場とメニュー遷移。CLASS は deep-link への直GETでは
// サーバ側セッションが確立されずログインページに戻されるため、litus と同様に
// (1) ShibbolethAuthServlet で入場(KMSI cookieでSSO自動完走→学生ポータル)
// (2) ポータル左メニューのアンカーを JSF postback でクリックして各面へ遷移する。
const ENTRY = 'https://class.admin.tus.ac.jp/uprx/ShibbolethAuthServlet'

/** 入場して学生ポータルまで到達したページを返す。SSO は storageState の cookie で自動完走する。 */
export async function enterClassPortal(ctx, { settleMs = 2500 } = {}) {
  const page = await ctx.newPage()
  await page.goto(ENTRY, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(settleMs)
  return page
}

/**
 * ポータルのメニューアンカー（テキスト部分一致・子フレームも横断）を litus の fireIn 方式で発火する。
 * data-pfconfirmcommand → onclick → click の順で PrimeFaces postback を起こし、遷移後の HTML を返す。
 * アンカーが無い（＝ログインページ等）場合も現在の HTML を返し、呼び出し側の判定に委ねる。
 */
export async function openSection(page, menuText, { settleMs = 4000 } = {}) {
  // メニューは前ページ遷移後に遅れて描画されることがある。アンカー出現を最大10秒待ってから発火する。
  await page
    .waitForFunction(
      (text) => {
        const norm = (s) => ((s || '') + '').replace(/\s+/g, '')
        const docs = [
          document,
          ...[...document.querySelectorAll('iframe,frame')]
            .map((f) => {
              try {
                return f.contentDocument
              } catch {
                return null
              }
            })
            .filter(Boolean),
        ]
        return docs.some((d) =>
          [...d.querySelectorAll('a')].some((a) => {
            const s = a.querySelector('.ui-menuitem-text')
            return norm(s ? s.textContent : a.textContent).indexOf(text) >= 0
          }),
        )
      },
      menuText,
      { timeout: 10000 },
    )
    .catch(() => {})
  const method = await page.evaluate((text) => {
    const norm = (s) => ((s || '') + '').replace(/\s+/g, '')
    const docs = [
      document,
      ...[...document.querySelectorAll('iframe,frame')]
        .map((f) => {
          try {
            return f.contentDocument
          } catch {
            return null
          }
        })
        .filter(Boolean),
    ]
    for (const d of docs) {
      const as = [...d.querySelectorAll('a')]
      const t = as.find((a) => {
        const s = a.querySelector('.ui-menuitem-text')
        return norm(s ? s.textContent : a.textContent).indexOf(text) >= 0
      })
      if (t) {
        const dpc = t.getAttribute('data-pfconfirmcommand')
        const oc = t.getAttribute('onclick')
        try {
          if (dpc) {
            // eslint-disable-next-line no-new-func
            Function(dpc).call(t)
            return 'pfconfirm'
          }
          if (oc) {
            // eslint-disable-next-line no-new-func
            Function('event', oc).call(t, new MouseEvent('click', { bubbles: true }))
            return 'onclick'
          }
          t.click()
          return 'click'
        } catch (e) {
          return 'err:' + e.message
        }
      }
    }
    return 'no-anchor'
  }, menuText)
  await page.waitForTimeout(settleMs)
  const html = await page.content()
  return { html, url: page.url(), method }
}
