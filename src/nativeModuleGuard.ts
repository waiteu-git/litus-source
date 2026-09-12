/**
 * ネイティブモジュールへの参照を検出する純粋ロジック。検出器は2つあり、守る対象が違う。
 *
 * ■ findStaticImportsOf ― 「読み込んだだけで落ちる」モジュールの静的 import
 *   （src/nativeModuleGuard.test.ts の GUARDED）
 *
 * 背景: 一部のネイティブモジュールは、実行環境によってはモジュール評価時点で例外を投げる。
 * - expo-notifications: SDK53+ の Expo Go では Android push が削除されており、
 *   `DevicePushTokenAutoRegistration` のトップレベル副作用が throw する。
 *   遅延 import ですら「読み込めば落ちる」ため、Expo Go では一切ロードしてはならない。
 * - react-native-android-widget: Android 専用。iOS ビルドと Expo Go(iOS/Android) に存在しない。
 *
 * これらは呼び出し側の try/catch や Platform ガードでは守れない。守れるのは「呼び出し」だけで、
 * import はモジュール読み込み時に無条件で走るため。実際に updateWidget.tsx（Platform ガード付き）と
 * resetAll.ts（try/catch 付き）の両方が、意図に反して起動時クラッシュを起こしていた。
 *
 * この検出器では `import type` は TypeScript が消去するので対象外。`await import()` も対象外
 * （ただし expo-notifications については遅延ロードも許されない点に注意）。
 *
 * ■ findRuntimeReferencesOf ― 「バイナリには入れるが、まだ JS から呼ばない」モジュールへの実行時の参照すべて
 *   （src/native/dormantNativeDeps.test.ts の休眠ラチェット・docs/design/2026-09-12-v11-train1-NATIVE.md §7 T2）
 *
 * 静的 import・副作用 import・再エクスポート（export … from）・動的 import・require を数える。
 * 数えないのは TypeScript が消す型だけの参照（import type / export type / typeof import）。
 * パッケージのサブパスも同じパッケージへの参照に数える。
 * コメントや文字列の中でも、上の書式どおりに引用符つきで書かれていれば数える（安全側に倒す）。
 */

/** 静的 import（`import ... from 'x'`）。`import type ...` は除外する。 */
const STATIC_IMPORT = /^[ \t]*import[ \t]+(?!type[ \t])[^;]*?from[ \t]*['"]([^'"]+)['"]/gm

/** 副作用のみの import（`import 'x'`）。 */
const BARE_IMPORT = /^[ \t]*import[ \t]*['"]([^'"]+)['"]/gm

/** 再エクスポート（`export { a } from 'x'`・`export * from 'x'`・`export * as n from 'x'`）。`export type { … } from` は拾わない。 */
const EXPORT_FROM = /^[ \t]*export[ \t]*(?:\*|\{)[^;]*?from[ \t]*['"]([^'"]+)['"]/gm

/** 動的 import（`import('x')`・`await import('x')`）。型の位置の `typeof import('x')` は拾わない。 */
const DYNAMIC_IMPORT = /(?<!\btypeof\s+)(?<![\w$.])import\s*\(\s*['"]([^'"]+)['"]/g

/** CommonJS の `require('x')`。`require.resolve` は読み込まないので拾わない。 */
const REQUIRE = /(?<![\w$.])require\s*\(\s*['"]([^'"]+)['"]/g

/**
 * source 内で modules のいずれかを静的 import していれば、そのモジュール名を返す。
 * 検出順ではなく modules の指定順で返す（テストの期待値を安定させるため）。
 */
export function findStaticImportsOf(source: string, modules: readonly string[]): string[] {
  const found = new Set<string>()
  for (const re of [STATIC_IMPORT, BARE_IMPORT]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      if (modules.includes(m[1])) found.add(m[1])
    }
  }
  return modules.filter((mod) => found.has(mod))
}

/**
 * source 内に modules のいずれかへの実行時の参照があれば、そのモジュール名を返す。
 * 検出順ではなく modules の指定順で返す（テストの期待値を安定させるため）。
 */
export function findRuntimeReferencesOf(source: string, modules: readonly string[]): string[] {
  const found = new Set<string>()
  for (const re of [STATIC_IMPORT, BARE_IMPORT, EXPORT_FROM, DYNAMIC_IMPORT, REQUIRE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const spec = m[1]
      for (const mod of modules) {
        if (spec === mod || spec.startsWith(`${mod}/`)) found.add(mod)
      }
    }
  }
  return modules.filter((mod) => found.has(mod))
}
