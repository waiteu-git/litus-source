import { RELEASE_STAGE } from '../releaseStage'

/**
 * 開発・ベータでの確認用の強制スイッチ（ビルド時に `EXPO_PUBLIC_REVIEW_FORCE=1` を渡した時だけ true）。
 * true でも reviewGate が安全側の否決（デモ・停止・お知らせ・診断バナー・授業・収集の稼働・前面・静止・
 * 同じ起動での依頼済み）は効かせ、適格・上限（14日・5日・120日など）と production の否決だけを飛ばす。
 * **production では常に false**（reviewGate も production の force を無視する二重の塞ぎ）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.6
 *
 * `process.env.EXPO_PUBLIC_*` はメンバ式の直書きでだけ babel-preset-expo がビルド時に定数化する
 * （releaseStage.ts と同じ）。分割代入や動的キーに書き換えないこと。
 */
export const REVIEW_FORCE: boolean =
  RELEASE_STAGE !== 'production' && process.env.EXPO_PUBLIC_REVIEW_FORCE === '1'
