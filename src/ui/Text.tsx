import { forwardRef } from 'react'
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { toPlexStyle } from './fontFamily'

/**
 * アプリ共通の Text。style の fontWeight を IBM Plex Sans JP の対応ウェイト
 * （400/500/700。600/800/900/bold は 700）の fontFamily へ変換して適用する。
 * RN はカスタムフォントの fontWeight 切替ができないため、全画面はこれを使う
 * （素の react-native の Text を直接使わない）。フォント未ロード時は RN が
 * システムフォントへフォールバックするため、ロード失敗でも表示は継続する。
 */
export const Text = forwardRef<RNText, TextProps>(function PlexText({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined
  return <RNText ref={ref} {...rest} style={toPlexStyle(flat)} />
})

/** Text と同じウェイト変換を適用した TextInput（入力欄の書体を本文と揃える）。 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function PlexTextInput(
  { style, ...rest },
  ref,
) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined
  return <RNTextInput ref={ref} {...rest} style={toPlexStyle(flat)} />
})
