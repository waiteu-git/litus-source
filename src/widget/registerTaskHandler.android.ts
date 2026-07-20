/**
 * ウィジェットのヘッドレスタスク登録（Android 実体）。
 *
 * アプリ停止中も OS から起動されて描画するため、registerRootComponent より前に
 * 同期で登録する必要がある。静的 import のままにしてあるのはそのため。
 * 非 Android では registerTaskHandler.ts（no-op）が解決される。
 */
import { registerWidgetTaskHandler as register } from 'react-native-android-widget'

import { widgetTaskHandler } from './widget-task-handler'

export function registerWidgetTaskHandler(): void {
  register(widgetTaskHandler)
}
