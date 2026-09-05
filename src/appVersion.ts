/**
 * アプリバージョン表示の整形（純ロジック・RN非依存・vitest対象）。
 * 🔴 2026-09-05 裁定: build は**内部管理と、配信しないテスト版**にのみ使う。
 * ⇒ production では版だけ（`v1.0.1`）、テスト版では build も併記（`v1.0.1 (build 212)`）。
 * ストアに出すたびに版が上がる（App Store が同一版での新規リリースを作らせない）ので、
 * 利用者が持つ成果物は版で一意に決まる＝表示に build は要らない。
 * ⚠ ただし機械判定（キルスイッチの versionRules）は build のまま。版の文字列比較は
 *   "1.1.0" と "1.10.0" のパース誤りを生み「全停止」か「誰も止まらない」に直結する。
 * 呼び出し側が expo-constants の nativeAppVersion / nativeBuildVersion を渡す。
 */
export function formatVersionLabel(
  version: string | null | undefined,
  build: string | number | null | undefined,
  showBuild = true,
): string {
  const v = typeof version === 'string' && version.trim() !== '' ? version.trim() : '1.0.0'
  const b = build != null && String(build).trim() !== '' ? String(build).trim() : null
  return showBuild && b ? `v${v} (build ${b})` : `v${v}`
}

/**
 * ホーム画面の開発ビルド識別タグ（APK名 litus-...-vNN の vNN と一致する短表記）。
 * versionCode(build) が取れない環境（Expo Go 等）では 'dev' を返す。
 */
export function formatBuildTag(build: string | number | null | undefined): string {
  const b = build != null && String(build).trim() !== '' ? String(build).trim() : null
  return b ? `v${b}` : 'dev'
}
