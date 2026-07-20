/**
 * ウィジェットのヘッドレスタスク登録（非 Android 用の no-op）。
 *
 * react-native-android-widget は Android 専用のネイティブモジュールで、iOS ビルドや
 * Expo Go(iOS) には存在しない。index.ts がトップレベルで静的 import すると、
 * 起動時のモジュール解決で落ちて画面が一切出ない。
 *
 * Metro のプラットフォーム別解決（`.android.ts` を優先し、無ければ本ファイル）で
 * Android のときだけ実体を読み込む。`await import()` を使わないのは、
 * index.ts の「registerRootComponent より前に登録する」という順序要件を
 * 崩さないため（動的 import にすると登録が後続のマイクロタスクへずれる）。
 */
export function registerWidgetTaskHandler(): void {
  // Android 以外にホーム画面ウィジェットは存在しないため何もしない。
}
