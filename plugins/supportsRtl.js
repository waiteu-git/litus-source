/**
 * AndroidManifest オブジェクトの <application> から RTL 対応フラグを落とす純粋関数。
 * config plugin 本体（withNoSupportsRtl.js）から切り離してあるのは、expo/config-plugins を
 * 読み込まずに vitest から検証できるようにするため。
 *
 * android:supportsRtl は Expo テンプレート由来で、app.json にも expo-build-properties にも
 * 設定キーが無い。RN 0.86 の I18nUtil.isRTL は ApplicationInfo.FLAG_SUPPORTS_RTL（＝この属性）を
 * ゲートにしているため、RTL 対応が無いアプリで true のままだとネイティブView側だけが
 * 部分的に鏡像化しうる。
 */
function setSupportsRtlFalse(androidManifest) {
  const app =
    androidManifest &&
    androidManifest.manifest &&
    androidManifest.manifest.application &&
    androidManifest.manifest.application[0]
  if (app && app.$) app.$['android:supportsRtl'] = 'false'
  return androidManifest
}

module.exports = { setSupportsRtlFalse }
