/**
 * 受動（passive）版フィンガープリント（spec§9・T8）。取得済みHTML文字列から Moodle の版と
 * body クラスを読む純関数群。
 *
 * LTW `src/core/moodleFingerprint.ts` を Litus へ 1:1 移植したもの。
 *
 * 設計原則:
 * - **このモジュール自身は絶対に fetch しない（追加リクエスト0）**。入力は既存の収集経路が
 *   すでに取得した HTML 文字列のみ（piggyback 専用）。大学サーバーへのリクエストを1本も
 *   増やさないことが T8 の絶対条件（負荷監査の前提を崩さない）。
 * - AsyncStorage / react-native / DOM に触れない純関数。保存は配線側（storage/moodleFingerprintStore）
 *   の責務、観測の集約は scanDiagnostics の責務。
 * - 版判定はあくまで**補助信号**。判定不能（null）は矛盾検知（diagnose.ts）に委ねる。
 *   版が読めないことをもって何かを「壊れている」と断定しない。
 * - **禁則（spec§2）**: `M.cfg` やテーマ/JS の asset-rev を版の情報源にしない
 *   （rev はキャッシュ purge 時刻であって版ではない・M.cfg に版情報は無い）。
 *   使えるのは `docs.moodle.org/<NNN>/` の版セグメントのみ。
 *
 * 用途（spec§9）: 版が BS5 世代（5.x）に上がったことを検知したら、診断バナー層で
 * 情報ノート1行を出す（`diagnosticsBannerContent.buildInfoNotes` の第2引数）。
 * **bs5=true を根拠にパース挙動を切り替える（lenient parse 等）ことはしない**
 * ＝ spec§8 の「BS5検知での自動lenient切替は当面やらない」を踏襲する。検知と正直な報告に留め、
 * 実際の破損捕捉は §4 の矛盾検知（diagnose.ts）とカナリア（Stage B）が担う。
 */

export interface MoodleVersion {
  major: number
  minor: number
}

export interface MoodleFingerprint {
  /** docs.moodle.org ヘルプリンクから読めた版。読めなければ null */
  version: MoodleVersion | null
  /** body 開始タグの class 一覧。body や class 属性が無ければ [] */
  bodyClasses: string[]
  /** BS5世代（Moodle 5.0以降）か。版不明なら false（＝現行 4.x 想定で扱う） */
  bs5: boolean
}

/**
 * 永続する最新観測（AsyncStorage 単一キー）。**版が読めた観測のみ**保存する（version は非null）。
 * bodyClasses はページ毎に揺れる一時情報なので永続しない。
 */
export interface StoredMoodleFingerprint {
  version: MoodleVersion
  bs5: boolean
  /** この版を最後に観測した時刻（ISO） */
  observedAt: string
}

/**
 * docs.moodle.org ヘルプリンクの版セグメント。
 * - ホストは docs.moodle.org 完全一致（mydocs.moodle.org 等のサブドメイン風は除外）。
 * - セグメントは3〜4桁の数字＋直後のスラッシュ（/405/・/501/・/1001/）。
 *   2桁（/39/=3.9 の旧形式）は対象範囲（4.5以降）に現れないため対象外。
 */
const DOCS_VERSION_RE = /(?<![\w.-])docs\.moodle\.org\/(\d{3,4})\//gi

/**
 * docs.moodle.org ヘルプリンクの版セグメントを抽出して版へ変換する。
 * 例: https://docs.moodle.org/405/ja/... → {major: 4, minor: 5}
 *
 * 変換規則: 末尾2桁が minor・残り先頭が major（405→4.5・500→5.0・502→5.2・311→3.11・1001→10.1）。
 *
 * 複数リンク混在時の仕様: **最頻値を採用し、同数なら先頭出現を優先**。
 * ページ chrome（フッタ/ヘルプポップオーバー）のリンクは全て稼働版を指す一方、教員がコース本文へ
 * 貼った別版の docs リンクは少数派になるため、最頻値が最も頑健。
 *
 * 見つからなければ null。
 */
export function extractDocsVersionSegment(html: string): MoodleVersion | null {
  const counts = new Map<string, number>()
  for (const match of String(html).matchAll(DOCS_VERSION_RE)) {
    const segment = match[1]
    counts.set(segment, (counts.get(segment) ?? 0) + 1)
  }

  // Map は挿入順を保持するため、厳密な「>」比較で同数時は先頭出現が勝つ。
  let best: string | null = null
  let bestCount = 0
  for (const [segment, count] of counts) {
    if (count > bestCount) {
      best = segment
      bestCount = count
    }
  }
  if (best === null) return null

  return {
    major: Number.parseInt(best.slice(0, -2), 10),
    minor: Number.parseInt(best.slice(-2), 10),
  }
}

/**
 * body 開始タグの class 一覧を抽出する。
 * - 最初の <body ...> タグのみを見る（複数行タグ・シングル/ダブル/無クォート対応）。
 * - body タグや class 属性が無ければ []（メンテページ・非HTML応答等）。
 * - data-class 等の別属性を class と誤認しない。
 *
 * 注: 収集経路が渡すのは `document.body.innerHTML`（body 開始タグを含まない）である場合が多い。
 * その場合は [] が返るのが正しい（誤った観測を作らない）。bodyClasses は補助情報であり、
 * 版判定（docs リンク）は innerHTML でもフッタのヘルプリンクから読める。
 */
export function extractBodyClasses(html: string): string[] {
  const bodyTag = /<body\b[^>]*>/i.exec(String(html))
  if (!bodyTag) return []
  const classAttr = /(?<![\w-])class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(bodyTag[0])
  if (!classAttr) return []
  const value = classAttr[1] ?? classAttr[2] ?? classAttr[3] ?? ''
  return value.split(/\s+/).filter((cls) => cls.length > 0)
}

/**
 * BS5世代（Bootstrap5＋再設計 Dashboard/My courses の Moodle 5.0 以降）かの判定。
 * 版不明（null）は false ＝現行（4.x）想定のまま扱い、破損検知は矛盾検知（diagnose.ts）に委ねる。
 */
export function isBs5Generation(version: MoodleVersion | null): boolean {
  return version !== null && version.major >= 5
}

/**
 * ページHTMLの passive フィンガープリントを束ねて返す。
 * 版と body クラスは独立に抽出する（片方が読めなくても他方は返る）。
 */
export function fingerprintPage(html: string): MoodleFingerprint {
  const version = extractDocsVersionSegment(html)
  return {
    version,
    bodyClasses: extractBodyClasses(html),
    bs5: isBs5Generation(version),
  }
}
