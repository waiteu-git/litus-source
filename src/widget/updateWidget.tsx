/**
 * データ更新時（時間割/課題/出席の収集完了直後）にホーム画面のウィジェットを即時再描画させる配線。
 * updatePeriodMillis（最短30分）だけに頼らず、収集フックから fire-and-forget で呼ぶ。
 * Android 専用・ネイティブモジュール未搭載環境（Expo Go 等）や未配置時も安全に無視する。
 */
import { Platform } from 'react-native'
import { requestWidgetUpdate } from 'react-native-android-widget'
import { WIDGET_MAIN, WIDGET_COMPACT } from './constants'
import { loadWidgetModel } from './widgetData'
import { TodayWidget, NextWidget } from './LitusWidget'

let inFlight = false

/** 配置済みウィジェットを最新データで描き直す。失敗は握りつぶす（表示更新は必須機能ではない）。 */
export function notifyWidgetDataChanged(): void {
  if (Platform.OS !== 'android') return
  if (inFlight) return
  inFlight = true
  ;(async () => {
    try {
      const model = await loadWidgetModel(new Date())
      await requestWidgetUpdate({
        widgetName: WIDGET_MAIN,
        renderWidget: () => <TodayWidget model={model} />,
      })
      await requestWidgetUpdate({
        widgetName: WIDGET_COMPACT,
        renderWidget: () => <NextWidget model={model} />,
      })
    } catch {
      // ネイティブモジュール未搭載/ウィジェット未配置などは無視。
    } finally {
      inFlight = false
    }
  })()
}
