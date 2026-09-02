/**
 * 自ビルド番号（Android の versionCode）。versionRules の対象判定と、kill switch キャッシュの
 * 帰属確認（`cache.build === APP_BUILD`）に使う。
 *
 * 🔴 **1箇所に置く理由**: キャッシュの帰属確認は `KillSwitchProvider`（画面）と
 * `notificationRefresh`（予約通知）の2つの読み手が持つ。片方だけがガードを持つと
 * **アプリ更新直後に画面は動くのに通知だけ黙る**（旧ビルド向けに解決された停止指示を通知側だけが
 * 流用する）。取得元を1つにして食い違いを構造的に防ぐ。
 *
 * ⚠ expo-constants の nativeBuildVersion は非推奨化で実装から消えており、常に undefined を返す
 *   （型は残るので型チェックもテストも素通りする）。build105 まではここが常に null で、
 *   版を絞った緊急停止（versionRules）が一度も適用されない状態だった。取得元を変えないこと。
 */
import * as Application from 'expo-application'
import { parseBuildNumber } from './killSwitch'

export const APP_BUILD = parseBuildNumber(Application.nativeBuildVersion)
