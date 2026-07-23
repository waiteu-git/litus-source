/**
 * ウィジェットのヘッドレスタスクハンドラ。アプリ停止中でも OS から起動され、AsyncStorage を直読して
 * 現在の表示モデルを組み立て、ウィジェット名に応じたレイアウトを描画する。
 * registerTaskHandler.android.ts が登録し、それを index.ts が呼ぶ（非 Android では no-op に解決される）。
 *
 * タップ（clickAction='OPEN_URI'）は OS がアプリ起動＋ litus:// を配信する形で処理されるため、
 * ここでは WIDGET_CLICK でも最新モデルの再描画に留める（遷移は widgetLinking が担う）。
 */
import * as React from 'react'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { WIDGET_COMPACT, WIDGET_SMALL, WIDGET_LARGE } from './constants'
import { loadWidgetModel } from './widgetData'
import { TodayWidget, NextWidget, SmallWidget, LargeWidget } from './LitusWidget'

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props
  if (widgetAction === 'WIDGET_DELETED') return

  const model = await loadWidgetModel(new Date())
  switch (widgetInfo.widgetName) {
    case WIDGET_COMPACT:
      renderWidget(<NextWidget model={model} />)
      break
    case WIDGET_SMALL:
      renderWidget(<SmallWidget model={model} />)
      break
    case WIDGET_LARGE:
      renderWidget(<LargeWidget model={model} />)
      break
    default:
      renderWidget(<TodayWidget model={model} />)
  }
}
