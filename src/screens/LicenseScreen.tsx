import { ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { FONT_LICENSE_TEXT, FONT_LICENSE_TITLE } from '../legal/fontLicense'

/**
 * フォントライセンス全文（低頻度・別画面化）。設定「ライセンス」アコーディオンの中身をそのまま移した。
 * 設計: docs/design/2026-09-13-settings-subject-declutter-design.md §4.2
 */
export default function LicenseScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]}>
        <View style={ui.card}>
          <Text style={{ color: ui.valueColor, fontWeight: '500' }}>{FONT_LICENSE_TITLE}</Text>
          <Text style={[styles.note, { color: ui.labelColor }]}>
            本アプリのUIフォントには {FONT_LICENSE_TITLE}（SIL Open Font License 1.1）を同梱しています。
          </Text>
          <Text style={[styles.licenseBody, { color: ui.labelColor }]}>{FONT_LICENSE_TEXT}</Text>
        </View>
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  body: { padding: 14 },
  note: { fontSize: 12, marginTop: 8 },
  licenseBody: { fontSize: 10, lineHeight: 15, marginTop: 10 },
})
