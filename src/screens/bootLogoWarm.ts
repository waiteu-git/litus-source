import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from './bootLogoHtml'

// bootLogoHtml.ts は生成物でアニメが全てインラインstyle（クラス無し）。CSS上書きが効かないため
// animation プロパティ値を文字列変換して「ロゴ完成＋ループのみ」の短縮版を作る。
// イントロ長 S=4.0s（LoginGate の BOOT_INTRO_MS と一致）をループ開始ディレイから差し引く。
const INTRO_SECONDS = 4.0

/** animation ショートハンド1件を短縮版へ。イントロ=0s畳み、ループ=ディレイ-4.0s（スタッガー保存）。 */
function warmAnimationPart(part: string): string {
  const p = part.trim()
  if (p === '' || p === 'none') return part
  if (p.includes('infinite')) {
    // 「 <delay>s infinite」のディレイをイントロ長ぶん前倒し。4→0 / 4.06→0.06。
    return p.replace(/(\s)(\d+(?:\.\d+)?)s(\s+infinite)/, (_m, pre, sec, post) => {
      const delay = Math.max(0, Number(sec) - INTRO_SECONDS)
      const s = Number.isInteger(delay) ? String(delay) : delay.toFixed(2)
      return `${pre}${s}s${post}`
    })
  }
  // イントロ（both フィル）: duration/delay を捨てて 0s に。both で最終フレームが即適用される。
  const name = p.split(/\s+/)[0]
  return `${name} 0s both`
}

/** animation:値をコンマで分割（括弧内のコンマは無視） */
function splitAnimationValue(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let parenDepth = 0

  for (const char of value) {
    if (char === '(') {
      parenDepth++
      current += char
    } else if (char === ')') {
      parenDepth--
      current += char
    } else if (char === ',' && parenDepth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

/** HTML中の全 animation: 値を短縮版へ変換する。 */
export function toWarmBootHtml(html: string): string {
  return html.replace(/animation:([^;"]+)/g, (_m, value: string) => {
    const parts = splitAnimationValue(value).map(warmAnimationPart)
    return `animation:${parts.join(', ')}`
  })
}

// 起動時のコストを避けるためモジュール読込時に一度だけ変換してキャッシュ。
export const WARM_BOOT_LOGO_GREEN = toWarmBootHtml(BOOT_LOGO_GREEN)
export const WARM_BOOT_LOGO_WHITE = toWarmBootHtml(BOOT_LOGO_WHITE)
