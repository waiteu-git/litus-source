// CLASS 3面(掲示/時間割/出席)を1回の入場で連続巡回する。deep-link直GETは不可なため
// enterClassPortal→openSection(メニューpostback) で遷移し、各面を litus 判定にかける。
import { enterClassPortal, openSection } from '../lib/classSession.mjs'
import { bulletinSignal, timetableSignal, attendanceSignal } from '../lib/signals.mjs'

// メニュー検索語は litus の opener に合わせる（掲示=掲示板 / 学生時間割表 / モバイル出席登録）。
const SECTIONS = [
  { surface: 'bulletin', menu: '掲示', sig: bulletinSignal },
  { surface: 'timetable', menu: '学生時間割表', sig: timetableSignal },
  { surface: 'attendance', menu: 'モバイル出席登録', sig: attendanceSignal },
]

/** CLASS 3面を巡回して [{surface, health, html}] を返す。1入場で3メニューを順にクリックする。 */
export async function probeClass(ctx, litus) {
  const out = []
  const page = await enterClassPortal(ctx)
  try {
    for (const s of SECTIONS) {
      try {
        const { html, url } = await openSection(page, s.menu)
        out.push({ surface: s.surface, health: s.sig(html, url, litus), html })
      } catch (e) {
        out.push({ surface: s.surface, health: { status: 'blocked' }, html: '', error: e.message })
      }
    }
  } finally {
    await page.close()
  }
  return out
}
