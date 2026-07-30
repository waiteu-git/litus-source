import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { RELEASE_STAGE } from '../releaseStage'
import { formatAndroidDevice, iosDeviceFromIdiom, type DiagEnv } from './diagReport'

/**
 * 報告に載せる環境情報を集める（RN依存の薄い層。整形と判断は `diagReport.ts` の純粋関数側）。
 *
 * 集めるのは**アプリの版・OS版・端末機種だけ**。学籍番号・氏名・メールアドレスは集めない
 * （含める理由がない）。広告ID・端末IDの類はそもそも取得していない。
 * `Constants.deviceName`（ユーザーが付けた端末名）は氏名が入りうるので**使わない**。
 *
 * ⚠版の取得元は `expo-application` を使う。
 * `Constants.nativeBuildVersion` / `Constants.nativeAppVersion` は実装が消えており常に // ratchet-allow
 * undefined（型だけ残る＝tsc も test も素通りする）。ラチェットは `src/appVersion.test.ts`。
 */
export function collectDiagEnv(): DiagEnv {
  return {
    appVersion: Application.nativeApplicationVersion,
    buildNumber: Application.nativeBuildVersion,
    releaseStage: RELEASE_STAGE,
    ...platformInfo(),
  }
}

function platformInfo(): Pick<DiagEnv, 'os' | 'osVersion' | 'device'> {
  if (Platform.OS === 'android') {
    const c = Platform.constants
    return {
      os: 'Android',
      // Release は '15' のような表示上のOS版。API level（Version）は括弧で添える＝
      // どのAPI levelで起きたかは挙動差の切り分けに直結する（DownloadManager・通知権限など）。
      osVersion: c.Release ? `${c.Release} (API ${String(c.Version)})` : `API ${String(c.Version)}`,
      device: formatAndroidDevice(c.Manufacturer, c.Model),
    }
  }
  if (Platform.OS === 'ios') {
    const c = Platform.constants
    return {
      // iPadOS では systemName が 'iPadOS' になる＝OSの取り違えを防げる。
      os: typeof c.systemName === 'string' && c.systemName !== '' ? c.systemName : 'iOS',
      osVersion: c.osVersion ?? null,
      device: iosDeviceFromIdiom(c.interfaceIdiom),
    }
  }
  return { os: Platform.OS, osVersion: null, device: null }
}
