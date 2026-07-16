/**
 * 並び替え可能セクション（キー付きの順序＋表示/非表示）の汎用モデル。ホーム/科目詳細で共用する純粋関数群を生成する。
 * order（既定順）と meta（表示名・非表示不可フラグ）を渡すと normalize/move/reorder/toggle と既定レイアウトを返す。
 * 端末非依存＝vitestで検証可能（homeSections/subjectSections がこのファクトリで再構成される＝各specでカバー）。
 */
export type SectionPref<K extends string> = { key: K; enabled: boolean }
export type SectionMeta = { label: string; fixedOn: boolean }

export type SectionLayoutOps<K extends string> = {
  DEFAULT: SectionPref<K>[]
  /** 保存値（不明形式含む）を正規化。既知キーを保存順で維持し、不明キー/重複を除去、欠けた既知キーを既定順アンカーへ挿入。 */
  normalize: (raw: unknown) => SectionPref<K>[]
  /** dir=-1で上へ、+1で下へ移動（端はそのまま）。新配列を返す。 */
  move: (layout: SectionPref<K>[], key: K, dir: -1 | 1) => SectionPref<K>[]
  /** item を fromIndex から toIndex へ移動した新配列（ドラッグ確定用）。範囲はクランプ。元配列は不変。 */
  reorder: (layout: SectionPref<K>[], fromIndex: number, toIndex: number) => SectionPref<K>[]
  /** 表示/非表示を反転（fixedOnキーは変更しない）。新配列を返す。 */
  toggle: (layout: SectionPref<K>[], key: K) => SectionPref<K>[]
}

export function createSectionLayout<K extends string>(
  order: readonly K[],
  meta: Record<K, SectionMeta>,
): SectionLayoutOps<K> {
  const KEYS: ReadonlySet<string> = new Set(order)
  const DEFAULT: SectionPref<K>[] = order.map((key) => ({ key, enabled: true }))

  /**
   * 欠けている既知キーを**既定順上のアンカー位置**へ挿入する（enabled=true）。
   * アンカー挿入＝既定順で自分より前にある最後の既存キーの直後（前に既存キーが無ければ先頭）。
   * 末尾追加だと、後から増えたセクションが保存済みレイアウトの全ユーザーで最下部に落ちてしまうため。
   */
  function normalize(raw: unknown): SectionPref<K>[] {
    const out: SectionPref<K>[] = []
    const seen = new Set<K>()
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (!e || typeof e !== 'object') continue
        const key = (e as { key?: unknown }).key
        if (typeof key !== 'string' || !KEYS.has(key) || seen.has(key as K)) continue
        const k = key as K
        const enabled = meta[k].fixedOn ? true : (e as { enabled?: unknown }).enabled !== false
        out.push({ key: k, enabled })
        seen.add(k)
      }
    }
    for (const k of order) {
      if (seen.has(k)) continue
      const orderIdx = order.indexOf(k)
      let insertAt = 0
      for (let i = 0; i < orderIdx; i++) {
        const pos = out.findIndex((s) => s.key === order[i])
        if (pos >= 0) insertAt = Math.max(insertAt, pos + 1)
      }
      out.splice(insertAt, 0, { key: k, enabled: true })
      seen.add(k)
    }
    return out
  }

  function move(layout: SectionPref<K>[], key: K, dir: -1 | 1): SectionPref<K>[] {
    const i = layout.findIndex((s) => s.key === key)
    if (i < 0) return layout
    const j = i + dir
    if (j < 0 || j >= layout.length) return layout
    const next = layout.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }

  function reorder(layout: SectionPref<K>[], fromIndex: number, toIndex: number): SectionPref<K>[] {
    const n = layout.length
    if (n === 0) return layout.slice()
    const from = Math.max(0, Math.min(n - 1, Math.trunc(fromIndex)))
    const to = Math.max(0, Math.min(n - 1, Math.trunc(toIndex)))
    const next = layout.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  function toggle(layout: SectionPref<K>[], key: K): SectionPref<K>[] {
    if (meta[key]?.fixedOn) return layout
    return layout.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s))
  }

  return { DEFAULT, normalize, move, reorder, toggle }
}
