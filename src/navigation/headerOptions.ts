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
  // iOS は戻るボタンに遷移元のタイトルを出す（Android は出さない）。ScreenHeader を自前描画する
  // 画面は headerShown:false で title を持たないため、iOS が route 名へフォールバックし
  // 「HomeHome」「Settings」「LetusCourses」等の内部名が日本語UIに英語で露出していた
  // （2026-07-29 に iPad 実機で発見。該当は title 無しの7画面すべてで、掲示画面固有ではない）。
  // 各画面に title を配る案もあるが、Android は元よりテキストを出さないので minimal で揃える方が
  // 出し分けを増やさずに済む（デザイン方針＝iOS 出し分けは戻る矢印の字形とセーフエリア程度に限定）。
  headerBackButtonDisplayMode: 'minimal',
}
