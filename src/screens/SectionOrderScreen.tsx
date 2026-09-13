import { useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { ScreenBg, useTabBarClearance } from '../ui/screen'
import { useDisplaySettings } from '../displaySettings'
import SectionLayoutReorder from '../ui/SectionLayoutReorder'
import { HOME_LAYOUT_OPS, HOME_SECTION_META } from '../home/homeSections'
import { SUBJECT_LAYOUT_OPS, SUBJECT_SECTION_META } from '../subject/subjectSections'
import type { HomeStackParamList } from '../navigation/types'

/**
 * ホーム／科目詳細のセクション並べ替えUIを別画面に切り出したもの（低頻度・別画面化）。
 * target パラメータで対象を切り替える1画面共用。ロジックは SettingsScreen の該当箇所と同じ
 * （SectionLayoutReorder はホーム/科目詳細で共用の汎用コンポーネント）。
 * 画面タイトルの出し分けは HomeStack.tsx の options={({ route }) => ...} が担う（Link/ClassEventForm と
 * 同じ形）。レンダー中の navigation.setOptions は「レンダー中に別コンポーネントを更新」警告の原因になる。
 * 設計: docs/design/2026-09-13-settings-subject-declutter-design.md §4.2
 */
export default function SectionOrderScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'SectionOrder'>>()
  const { target } = route.params
  const { homeLayout, subjectLayout, setHomeLayout, setSubjectLayout } = useDisplaySettings()
  const clearance = useTabBarClearance()
  // ドラッグ中は親 ScrollView のスクロールを止める（SettingsScreen と同じ理由: 縦ジェスチャ競合の回避）。
  const [reordering, setReordering] = useState(false)

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]} scrollEnabled={!reordering}>
        {target === 'home' ? (
          <SectionLayoutReorder
            layout={homeLayout}
            meta={HOME_SECTION_META}
            ops={HOME_LAYOUT_OPS}
            onChange={setHomeLayout}
            onDragActive={setReordering}
          />
        ) : (
          <SectionLayoutReorder
            layout={subjectLayout}
            meta={SUBJECT_SECTION_META}
            ops={SUBJECT_LAYOUT_OPS}
            onChange={setSubjectLayout}
            onDragActive={setReordering}
          />
        )}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  body: { padding: 14 },
})
