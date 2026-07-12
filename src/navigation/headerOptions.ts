import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import { COLORS } from '../theme'
import { FONT } from '../ui/fontFamily'

/**
 * 全 native-stack 共通のヘッダ配色・書体。React Navigation のヘッダタイトルは共通 Text ラッパーを
 * 通らないため、fontFamily を直指定する（fontWeight は効かないので 600 相当は FONT.bold=700 に寄せる）。
 * 3スタックで重複していた screenOptions をここへ集約し、変更を一箇所で済ませる。
 */
export const stackHeaderOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: COLORS.emerald },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontFamily: FONT.bold },
}
