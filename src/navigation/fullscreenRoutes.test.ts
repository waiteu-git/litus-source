import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  FULLSCREEN_VIEWER_ROUTES,
  HIDE_TAB_BAR_ROUTES,
  HIDE_ATTENDANCE_FAB_ROUTES,
} from './fullscreenRoutes'

describe('全画面ビューアの浮遊UI抑止', () => {
  it('BulletinWeb でタブバーと出席FABを隠す', () => {
    // 掲示のCLASS表示は下端に「やり直す」(bottom:20)を持つ全画面WebViewなのに集合から漏れており、
    // 浮遊タブバー(bottom:0/height:70/elevation:8)が完全に覆ってタップも奪っていた。
    expect(HIDE_TAB_BAR_ROUTES.has('BulletinWeb')).toBe(true)
    expect(HIDE_ATTENDANCE_FAB_ROUTES.has('BulletinWeb')).toBe(true)
  })

  it('既存の全画面ビューアも従来どおり隠す（回帰防止）', () => {
    for (const r of ['Web', 'PdfViewer', 'Link']) {
      expect(HIDE_TAB_BAR_ROUTES.has(r)).toBe(true)
      expect(HIDE_ATTENDANCE_FAB_ROUTES.has(r)).toBe(true)
    }
  })

  it('FAB 抑止はタブバー抑止を必ず包含する（片方だけ出るズレを構造的に禁止）', () => {
    for (const r of FULLSCREEN_VIEWER_ROUTES) {
      expect(HIDE_ATTENDANCE_FAB_ROUTES.has(r)).toBe(true)
    }
  })

  it('FAB 固有の抑止対象（ホーム自身・出席画面自身）を保つ', () => {
    expect(HIDE_ATTENDANCE_FAB_ROUTES.has('HomeHome')).toBe(true)
    expect(HIDE_ATTENDANCE_FAB_ROUTES.has('Attendance')).toBe(true)
    // タブバーはこの2画面では隠さない（通常画面のため）
    expect(HIDE_TAB_BAR_ROUTES.has('HomeHome')).toBe(false)
    expect(HIDE_TAB_BAR_ROUTES.has('Attendance')).toBe(false)
  })

  it('列挙したルート名は実際に Stack へ登録されている（死に設定の検出）', () => {
    const dir = __dirname
    const registered = new Set<string>()
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('Stack.tsx')) continue
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)) registered.add(m[1])
    }
    for (const r of FULLSCREEN_VIEWER_ROUTES) expect(registered.has(r)).toBe(true)
  })
})
