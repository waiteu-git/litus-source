/**
 * アプリバージョン表示の整形（純ロジック・RN非依存・vitest対象）。
 * versionName は v1.0.0 固定運用のため、ビルドごとに動く versionCode(build) を併記して
 * 「更新されている」ことを可視化する。呼び出し側が expo-constants の
 * nativeAppVersion(versionName) / nativeBuildVersion(versionCode) を渡す。
 */
export function formatVersionLabel(
  version: string | null | undefined,
  build: string | number | null | undefined,
): string {
  const v = typeof version === 'string' && version.trim() !== '' ? version.trim() : '1.0.0'
  const b = build != null && String(build).trim() !== '' ? String(build).trim() : null
  return b ? `v${v} (build ${b})` : `v${v}`
}
