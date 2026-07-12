/**
 * ウィジェットのディープリンク（litus://...）を受けて画面遷移につなぐ RN 側の配線。
 * cold start（起動時に URL で開かれた）と warm（起動中に URL 受信）の両方を購読し、
 * 解析結果（widgetDeepLink の純関数）に応じて navigationRef の request* を呼ぶ。
 * navigationRef 未準備でも request* は pending を立て onReady 後に消化される（既存の通知導線と同じ挙動）。
 */
import { Linking } from 'react-native'
import { parseWidgetUrl, type WidgetRoute } from './widgetDeepLink'
import {
  requestOpenAttendance,
  requestOpenTimetable,
  requestOpenAssignment,
} from '../navigation/navigationRef'

function dispatch(route: WidgetRoute | null): void {
  if (!route) return
  switch (route.kind) {
    case 'attendance':
      requestOpenAttendance()
      break
    case 'timetable':
      requestOpenTimetable()
      break
    case 'assignment':
      requestOpenAssignment(route.url)
      break
    case 'home':
      // ホームは既定タブ。特段の遷移は不要（アプリが前面に来るだけで足りる）。
      break
  }
}

/** URL 文字列を解釈して遷移要求を出す。App 側の Linking 購読から呼ぶ。 */
export function handleWidgetUrl(url: string | null | undefined): void {
  dispatch(parseWidgetUrl(url))
}

/**
 * ウィジェットのディープリンク購読を開始する。App の useEffect から呼び、返り値の解除関数を cleanup で使う。
 * 起動時 URL も一度消化する。
 */
export function subscribeWidgetLinks(): () => void {
  Linking.getInitialURL()
    .then((url) => handleWidgetUrl(url))
    .catch(() => undefined)
  const sub = Linking.addEventListener('url', ({ url }) => handleWidgetUrl(url))
  return () => sub.remove()
}
