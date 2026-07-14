/**
 * ホーム画面の並び替え可能セクションの定義と、保存された並び順の正規化・操作（純粋関数）。
 * 端末非依存＝vitestで検証可能。設定タブでユーザーが順序と表示/非表示を変更し、HomeScreenがこの順で描画する。
 * 新セクションを後から追加しても normalizeHomeLayout が既存設定に自動マージするので破綻しない。
 */
export type HomeSectionKey =
  | 'nowClass'
  | 'laterClasses'
  | 'deadlines'
  | 'todayChanges'
  | 'letusNews'
  | 'bulletins'
  | 'entries'
export type HomeSectionPref = { key: HomeSectionKey; enabled: boolean }

/** 既定の並び順（ユーザー指定 2026-07-14: 今の授業→今日の変更→LETUS新着→CLASS掲示→直近の課題→このあとの授業→その他。
 * LETUS新着は「初期ではCLASS掲示の上」の指定）。 */
export const HOME_SECTION_ORDER: HomeSectionKey[] = [
  'nowClass',
  'todayChanges',
  'letusNews',
  'bulletins',
  'deadlines',
  'laterClasses',
  'entries',
]

/** セクション表示名と、非表示不可（常に表示）フラグ。entries=出席登録/インフォは動線なので常時表示。 */
export const HOME_SECTION_META: Record<HomeSectionKey, { label: string; fixedOn: boolean }> = {
  nowClass: { label: 'いまの授業', fixedOn: false },
  laterClasses: { label: 'このあとの授業', fixedOn: false },
  deadlines: { label: '直近の締切', fixedOn: false },
  todayChanges: { label: '今日の変更', fixedOn: false },
  letusNews: { label: 'LETUS新着', fixedOn: false },
  bulletins: { label: 'CLASS掲示', fixedOn: false },
  entries: { label: 'その他（出席登録・インフォ）', fixedOn: true },
}

const KEYS: ReadonlySet<string> = new Set(HOME_SECTION_ORDER)

export const DEFAULT_HOME_LAYOUT: HomeSectionPref[] = HOME_SECTION_ORDER.map((key) => ({ key, enabled: true }))

/**
 * 保存値（不明形式含む）を正規化する。既知キーを保存順で維持し、不明キー/重複は除去、
 * 欠けている既知キーは**既定順上のアンカー位置**へ挿入する（enabled=true）。
 * アンカー挿入＝既定順で自分より前にある最後の既存キーの直後（前に既存キーが無ければ先頭）。
 * 末尾追加だと、後から増えたセクション（例: letusNews=既定でCLASS掲示の上）が保存済み
 * レイアウトの全ユーザーで最下部に落ちてしまうため。fixedOnキーは常にenabled=true。
 */
export function normalizeHomeLayout(raw: unknown): HomeSectionPref[] {
  const out: HomeSectionPref[] = []
  const seen = new Set<HomeSectionKey>()
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (!e || typeof e !== 'object') continue
      const key = (e as { key?: unknown }).key
      if (typeof key !== 'string' || !KEYS.has(key) || seen.has(key as HomeSectionKey)) continue
      const k = key as HomeSectionKey
      const enabled = HOME_SECTION_META[k].fixedOn ? true : (e as { enabled?: unknown }).enabled !== false
      out.push({ key: k, enabled })
      seen.add(k)
    }
  }
  // 欠けている既知キーをアンカー位置へ挿入する（既定順に処理＝連続して欠けても既定順が保たれる）。
  // 挿入位置＝「既定順で自分より前にある全キー」のうち保存側に存在する最後尾の直後。
  // これで既定順の前後関係（例: letusNews は todayChanges より後）を保存順を壊さずに満たす。
  for (const k of HOME_SECTION_ORDER) {
    if (seen.has(k)) continue
    const orderIdx = HOME_SECTION_ORDER.indexOf(k)
    let insertAt = 0
    for (let i = 0; i < orderIdx; i++) {
      const pos = out.findIndex((s) => s.key === HOME_SECTION_ORDER[i])
      if (pos >= 0) insertAt = Math.max(insertAt, pos + 1)
    }
    out.splice(insertAt, 0, { key: k, enabled: true })
    seen.add(k)
  }
  return out
}

/** dir=-1で上へ、+1で下へ移動（端はそのまま）。新配列を返す。 */
export function moveSection(layout: HomeSectionPref[], key: HomeSectionKey, dir: -1 | 1): HomeSectionPref[] {
  const i = layout.findIndex((s) => s.key === key)
  if (i < 0) return layout
  const j = i + dir
  if (j < 0 || j >= layout.length) return layout
  const next = layout.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** 表示/非表示を反転（fixedOnキーは変更しない）。新配列を返す。 */
export function toggleSection(layout: HomeSectionPref[], key: HomeSectionKey): HomeSectionPref[] {
  if (HOME_SECTION_META[key]?.fixedOn) return layout
  return layout.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s))
}
