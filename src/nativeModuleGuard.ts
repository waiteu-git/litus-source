/**
 * 「読み込んだだけで落ちる」ネイティブモジュールの静的 import を検出する純粋ロジック。
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
 * `import type` は TypeScript が消去するので検出対象外。`await import()` も対象外
 * （ただし expo-notifications については遅延ロードも許されない点に注意）。
 */

/** 静的 import（`import ... from 'x'`）。`import type ...` は除外する。 */
const STATIC_IMPORT = /^[ \t]*import[ \t]+(?!type[ \t])[^;]*?from[ \t]*['"]([^'"]+)['"]/gm

/** 副作用のみの import（`import 'x'`）。 */
const BARE_IMPORT = /^[ \t]*import[ \t]*['"]([^'"]+)['"]/gm

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
