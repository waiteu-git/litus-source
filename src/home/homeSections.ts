/**
 * ホーム画面の並び替え可能セクションの定義。順序の正規化・操作（純粋関数）は汎用ファクトリ
 * createSectionLayout（src/ui/sectionLayout.ts）で生成する（科目詳細と共用）。
 * 設定タブでユーザーが順序と表示/非表示を変更し、HomeScreenがこの順で描画する。
 * 新セクションを後から追加しても normalizeHomeLayout が既存設定に自動マージするので破綻しない。
 *
 * 2026-09-18: 旧`examCountdown`/`laterClasses`/`deadlines`/`todayChanges`/`letusNews`/`bulletins`/
 * `entries`の7キーを廃止し、1個の`quickTiles`へ統合した（認知負荷削減・設計書
 * docs/superpowers/specs/2026-09-18-home-cognitive-load-design.md）。旧キーを含む保存済み
 * レイアウトは normalize が黙って捨て、quickTiles をアンカー位置へ自動挿入するので移行コード不要。
 */
import { createSectionLayout, type SectionMeta, type SectionPref } from '../ui/sectionLayout'

export type HomeSectionKey = 'nowClass' | 'scheduleNotice' | 'quickTiles'
export type HomeSectionPref = SectionPref<HomeSectionKey>

/** 既定の並び順：いまの授業→休講等のお知らせ→クイックタイル。 */
export const HOME_SECTION_ORDER: HomeSectionKey[] = ['nowClass', 'scheduleNotice', 'quickTiles']

/** セクション表示名と、非表示不可（常に表示）フラグ。 */
export const HOME_SECTION_META: Record<HomeSectionKey, SectionMeta> = {
  nowClass: { label: 'いまの授業', fixedOn: false },
  scheduleNotice: { label: '休講・補講・教室変更のお知らせ', fixedOn: true },
  quickTiles: { label: '直近の締切・試験・掲示・新着など', fixedOn: false },
}

const ops = createSectionLayout(HOME_SECTION_ORDER, HOME_SECTION_META)

/** SectionLayoutReorder へ渡す操作束（move/reorder/toggle）。 */
export const HOME_LAYOUT_OPS = ops

export const DEFAULT_HOME_LAYOUT: HomeSectionPref[] = ops.DEFAULT
export const normalizeHomeLayout = ops.normalize
export const moveSection = ops.move
export const reorderHomeLayout = ops.reorder
export const toggleSection = ops.toggle
