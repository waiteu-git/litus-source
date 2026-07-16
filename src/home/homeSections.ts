/**
 * ホーム画面の並び替え可能セクションの定義。順序の正規化・操作（純粋関数）は汎用ファクトリ
 * createSectionLayout（src/ui/sectionLayout.ts）で生成する（科目詳細と共用）。
 * 設定タブでユーザーが順序と表示/非表示を変更し、HomeScreenがこの順で描画する。
 * 新セクションを後から追加しても normalizeHomeLayout が既存設定に自動マージするので破綻しない。
 */
import { createSectionLayout, type SectionMeta, type SectionPref } from '../ui/sectionLayout'

export type HomeSectionKey =
  | 'nowClass'
  | 'laterClasses'
  | 'deadlines'
  | 'todayChanges'
  | 'letusNews'
  | 'bulletins'
  | 'entries'
export type HomeSectionPref = SectionPref<HomeSectionKey>

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
export const HOME_SECTION_META: Record<HomeSectionKey, SectionMeta> = {
  nowClass: { label: 'いまの授業', fixedOn: false },
  laterClasses: { label: 'このあとの授業', fixedOn: false },
  deadlines: { label: '直近の締切', fixedOn: false },
  todayChanges: { label: '今日の変更', fixedOn: false },
  letusNews: { label: 'LETUS新着', fixedOn: false },
  bulletins: { label: 'CLASS掲示', fixedOn: false },
  entries: { label: 'その他（出席登録・インフォ）', fixedOn: true },
}

const ops = createSectionLayout(HOME_SECTION_ORDER, HOME_SECTION_META)

/** SectionLayoutReorder へ渡す操作束（move/reorder/toggle）。 */
export const HOME_LAYOUT_OPS = ops

export const DEFAULT_HOME_LAYOUT: HomeSectionPref[] = ops.DEFAULT
export const normalizeHomeLayout = ops.normalize
export const moveSection = ops.move
export const reorderHomeLayout = ops.reorder
export const toggleSection = ops.toggle
