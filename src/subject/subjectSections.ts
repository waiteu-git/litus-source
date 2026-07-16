/**
 * 科目詳細（SubjectDetailScreen）の並び替え可能セクションの定義。順序の正規化・操作は汎用ファクトリ
 * createSectionLayout（src/ui/sectionLayout.ts）で生成する（ホームと共用）。
 * 設定タブ「表示」でユーザーが順序と表示/非表示を変更し、全科目共通の並びとして適用される。
 */
import { createSectionLayout, type SectionMeta, type SectionPref } from '../ui/sectionLayout'

export type SubjectSectionKey = 'events' | 'updates' | 'links' | 'attendance' | 'pattern'
export type SubjectSectionPref = SectionPref<SubjectSectionKey>

/** 既定順（ユーザー確定 2026-07-16）: 各回の予定→更新状況→リンク→出席→実施パターン。 */
export const SUBJECT_SECTION_ORDER: SubjectSectionKey[] = ['events', 'updates', 'links', 'attendance', 'pattern']

/** セクション表示名と、非表示不可フラグ。links は LETUS/シラバス/課題追加/更新チェック（UpdateCheck 画面への
 * アプリ内唯一の導線）の動線なので常時表示（ホームの entries と同じ理由・死に導線防止）。 */
export const SUBJECT_SECTION_META: Record<SubjectSectionKey, SectionMeta> = {
  events: { label: '各回の予定', fixedOn: false },
  updates: { label: '更新状況', fixedOn: false },
  links: { label: 'リンク', fixedOn: true },
  attendance: { label: '出欠', fixedOn: false },
  pattern: { label: '実施パターン', fixedOn: false },
}

const ops = createSectionLayout(SUBJECT_SECTION_ORDER, SUBJECT_SECTION_META)

/** SectionLayoutReorder へ渡す操作束（move/reorder/toggle）。 */
export const SUBJECT_LAYOUT_OPS = ops

export const DEFAULT_SUBJECT_LAYOUT: SubjectSectionPref[] = ops.DEFAULT
export const normalizeSubjectLayout = ops.normalize
export const moveSubjectSection = ops.move
export const reorderSubjectLayout = ops.reorder
export const toggleSubjectSection = ops.toggle
