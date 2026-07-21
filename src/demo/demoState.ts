/**
 * デモデータのシード要否判定（純粋・RN非依存）。
 *
 * デモに入るたび毎回シードし直すと、審査員が触った変更（既読・出席登録など）が
 * 即座に消えて不自然になる。既にシード済みなら再投入しない。
 *
 * このキー自体もデモ名前空間へ入る（Storage 経由で読み書きするため）。
 * したがってデモ終了時に clearDemoNamespace で一緒に消え、次回は再シードされる。
 */
export const DEMO_SEEDED_KEY = 'demo.seeded.v1'

export function shouldSeedDemo(existing: string | null): boolean {
  return existing !== '1'
}
