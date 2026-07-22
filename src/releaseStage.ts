/**
 * ビルド種別（RN非依存・vitest対象）。production 以外は「まだ出荷物ではない」＝開発版表記を出す。
 *
 * __DEV__ では切れない: 現行のベータ配布は gradlew assembleRelease で作る＝__DEV__ が false なので、
 * __DEV__ で分岐するとテスター配布のAPKからも版の識別情報が消え、バグ報告時にどのビルドを
 * 触っているか分からなくなる。ビルドプロファイル由来の env で切る。
 */
export type ReleaseStage = 'dev' | 'beta' | 'production'

/** ビルド時に注入される値を正規化する。未設定・未知値は安全側（＝プレリリース扱い）に倒す。 */
export function resolveReleaseStage(raw: string | undefined | null): ReleaseStage {
  if (raw === 'production') return 'production'
  if (raw === 'beta') return 'beta'
  return 'dev'
}

export function isPrerelease(stage: ReleaseStage): boolean {
  return stage !== 'production'
}

/** 設定画面のバージョン行に付ける接尾辞。production では空文字。 */
export function devBadgeSuffix(stage: ReleaseStage): string {
  return isPrerelease(stage) ? '（開発版）' : ''
}

/** ホームのビルド識別タグを出すか。 */
export function shouldShowBuildTag(stage: ReleaseStage): boolean {
  return isPrerelease(stage)
}

// babel-preset-expo の inline-env-vars が process.env.EXPO_PUBLIC_* をビルド時に定数化する。
// メンバ式の直書きでのみインライン化されるので、分割代入や動的キーに書き換えないこと
// （書き換えるとビルド後に undefined になり、production でも「（開発版）」が残る）。
export const RELEASE_STAGE: ReleaseStage = resolveReleaseStage(process.env.EXPO_PUBLIC_RELEASE_STAGE)
