/**
 * iOS の entitlements から `aps-environment`（Push Notifications capability）を落とす純粋関数。
 * config plugin 本体（withNoApsEnvironment.js）から切り離してあるのは、expo/config-plugins を
 * 読み込まずに vitest から検証できるようにするため（supportsRtl.js と同じ構成）。
 *
 * **なぜ要るか**
 *
 * `expo-notifications` の config plugin はルートで Android と iOS の両方に適用され、
 * withNotificationsIOS.js が `aps-environment` を entitlements へ**無条件で**書き込む
 * （props が空でも既定 mode='development' が入る）。
 *
 * しかもこれは app.json からエントリを外しても避けられない。@expo/prebuild-config の
 * `versionedExpoSDKPackages` に expo-notifications が含まれており、未記載なら prebuild が
 * **props 無しで自動適用する**（withDefaultPlugins.js → createLegacyPlugin → withStaticPlugin が
 * パッケージ同梱の app.plugin.js を解決して実行する）。
 * ＝「書かない」は iOS 側の副作用を消す手段になっていない。逆に Android 側は props 無しで走るため
 * 通知アイコンの meta-data と drawable が**削除**され、small icon が白い塊に落ちる。
 *
 * 本製品はプッシュを一切使わない（FCM なし・google-services.json なし・プッシュトークン取得 0 件・
 * 通知はすべて expo-notifications のローカル予約）。iOS のローカル通知に
 * Push Notifications capability は不要で、宣言するとストアのデータセーフティ申告と食い違ううえ、
 * App ID 側で capability を有効にしていないとプロビジョニングが一致せずビルド/提出で落ちる。
 *
 * したがって「Android の配線のために expo-notifications を app.json へ記載し、iOS の副作用は
 * mod で落とす」を採る。
 *
 * **⚠ app.json の plugins では expo-notifications より「前」に置くこと。**
 * 直感に反するが、`withMod` は同じ mod に対して**後から登録した action を外側に積む**
 * （`config.mods[platform][mod]` を新しい interceptingMod で置き換え、古い方を `nextMod` として渡す）。
 * ＝**後に登録した action ほど先に走る**。実測でも、後ろに置いた場合は
 * expo-notifications の書き込みが後勝ちして `aps-environment=development` が残り、
 * 前に置いた場合だけ entitlements が `<dict/>` になった（2026-07-24・prebuild 成果物で確認）。
 */
const APS_ENVIRONMENT = 'aps-environment'

/** entitlements オブジェクトから aps-environment を取り除く。 */
function stripApsEnvironment(entitlements) {
  if (!entitlements || typeof entitlements !== 'object') return entitlements
  delete entitlements[APS_ENVIRONMENT]
  return entitlements
}

module.exports = { stripApsEnvironment, APS_ENVIRONMENT }
