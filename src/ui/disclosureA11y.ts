import { Platform, type AccessibilityActionEvent, type AccessibilityProps } from 'react-native'
import { disclosureA11y, disclosureActionToggles } from './a11yState'

/**
 * 開閉する見出し（Accordion・課題の「期限切れ」「非表示」）の読み上げ props（E0 §4-1・A3・A5）。
 * 判断は a11yState.ts の disclosureA11y に任せ、ここは Platform に応じて props へ写すだけ。
 * - iOS: 役割と値「展開中／折りたたみ中」だけ。expanded は渡さない（英語 "expanded" が読まれる公算＝F23）。
 *   操作も載せない（ダブルタップが既に開閉で、ラベルの無い操作はローターに英語名 "expand" のまま出る）。
 * - Android: expanded と、今の状態に合う操作1つ（F24）。操作が来たら disclosureActionToggles が true の時だけ toggle。
 */
export function disclosureA11yProps(open: boolean, toggle: () => void): AccessibilityProps {
  const d = disclosureA11y(Platform.OS === 'ios' ? 'ios' : 'android', open)
  if ('valueText' in d) {
    return { accessibilityRole: d.role, accessibilityValue: { text: d.valueText } }
  }
  return {
    accessibilityRole: d.role,
    accessibilityState: { expanded: d.expanded },
    accessibilityActions: [{ name: d.action }],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (disclosureActionToggles(e.nativeEvent.actionName, open)) toggle()
    },
  }
}
