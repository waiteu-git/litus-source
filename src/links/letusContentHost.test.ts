import { describe, expect, it } from 'vitest'
import { isLetusContentUrl } from './letusContentHost'

describe('isLetusContentUrl', () => {
  it('正例: LETUS本体は通る', () => {
    expect(isLetusContentUrl('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1')).toBe(true)
    expect(isLetusContentUrl('https://LETUS.ED.TUS.AC.JP/course/view.php?id=5')).toBe(true)
    // 末尾ドットは同じホスト（externalLink の hostOf が落とす）
    expect(isLetusContentUrl('https://letus.ed.tus.ac.jp./my/courses.php')).toBe(true)
  })

  it('🔴監査の攻撃URL: パスが本物でもホストが違えば落とす', () => {
    expect(isLetusContentUrl('https://evil.example/mod/assign/view.php?id=1')).toBe(false)
  })

  it('🔴externalLink の SSOマーカーで通るURLも、こちらは落とす（用途が違う）', () => {
    // classifyLinkTarget はこれを 'in-app' にする（ログイン連鎖の保険）。自動取得は別。
    expect(isLetusContentUrl('https://evil.example/idp/login')).toBe(false)
    expect(isLetusContentUrl('https://evil.example/x?SAMLRequest=abc')).toBe(false)
  })

  it('🔴 userinfo による偽装を落とす', () => {
    expect(isLetusContentUrl('https://letus.ed.tus.ac.jp@evil.example/mod/assign/view.php')).toBe(false)
  })

  it('🔴 サブドメイン・接尾辞の偽装を落とす（完全一致のみ）', () => {
    expect(isLetusContentUrl('https://letus.ed.tus.ac.jp.evil.example/mod/assign/view.php')).toBe(false)
    expect(isLetusContentUrl('https://evil-letus.ed.tus.ac.jp/mod/assign/view.php')).toBe(false)
    expect(isLetusContentUrl('https://sub.letus.ed.tus.ac.jp/mod/assign/view.php')).toBe(false)
  })

  it('🔴 学内の別ホストも自動取得の対象にはしない（CLASSは別経路）', () => {
    expect(isLetusContentUrl('https://class.admin.tus.ac.jp/')).toBe(false)
  })

  it('非httpsは落とす', () => {
    expect(isLetusContentUrl('http://letus.ed.tus.ac.jp/mod/assign/view.php')).toBe(false)
    expect(isLetusContentUrl('javascript:alert(1)')).toBe(false)
    expect(isLetusContentUrl('data:text/html,<script>1</script>')).toBe(false)
    expect(isLetusContentUrl('file:///etc/passwd')).toBe(false)
  })

  it('壊れた入力は fail-closed', () => {
    expect(isLetusContentUrl('')).toBe(false)
    expect(isLetusContentUrl('   ')).toBe(false)
    expect(isLetusContentUrl(null)).toBe(false)
    expect(isLetusContentUrl(undefined)).toBe(false)
    expect(isLetusContentUrl(123)).toBe(false)
    expect(isLetusContentUrl('manual://abc')).toBe(false)
    expect(isLetusContentUrl('https://')).toBe(false)
  })
})

describe('🔴 URL解析の食い違いによる回避（2026-08-28 差分監査 CONFIRMED）', () => {
  // WHATWG（実際にWebViewが行く先）と自前解析が食い違うと、許可リストもホスト表示も
  // 攻撃者の道具になる。**判定が実際の遷移先と一致することを直接照合する。**
  const cases = [
    'https://evil.example\\@letus.ed.tus.ac.jp/mod/assign/view.php?id=1',
    'https://evil.example\\letus.ed.tus.ac.jp/mod/assign/view.php',
    'https://letus.ed.tus.ac.jp\\@evil.example/mod/assign/view.php',
    'https://evil.example\t@letus.ed.tus.ac.jp/mod/assign/view.php',
    'https://evil.example\n@letus.ed.tus.ac.jp/mod/assign/view.php',
    'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1',
    'https://letus.ed.tus.ac.jp:443/mod/assign/view.php',
    'https://user@letus.ed.tus.ac.jp/mod/assign/view.php',
  ]
  it.each(cases)('実際の遷移先と判定が一致する: %s', (url) => {
    const actual = new URL(url).host.toLowerCase().replace(/\.+$/, '')
    expect(isLetusContentUrl(url)).toBe(actual === 'letus.ed.tus.ac.jp')
  })
})
