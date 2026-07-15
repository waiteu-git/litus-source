/**
 * CLASS(JSF)は同一セッションでの複数画面同時操作を禁止する（"別の画面で操作されました"＋ViewExpired）。
 * CLASS収集（掲示/時間割/出欠/掲示アクション）は全て共有骨格 [[ClassHeadlessCollector]] 経由でこのリースを
 * 取ってからCLASSへ入場する。1度に1収集だけがCLASSに触れるようFIFOで直列化し、収集どうしの並走で
 * 多重画面競合に弾かれるのを防ぐ（実機実証: 時間割→出欠の連続入場が multi/syserr で空振り。pi の逐次実行では
 * 再現せず＝並走が真因）。[[classViewArbiter]] は収集 vs 出席タブの調停で、収集どうしの直列化はしないため本リースが補う。
 *
 * React非依存の純粋モジュール（module-levelの単一ミューテックス）。取得は Promise で、埋まっていれば
 * 待機列に積まれ、保持者の返却でFIFOに引き渡される。取得の解決値 settle は「直前に別収集がCLASSを使っていたか
 * （引き継ぎか）」で、呼び出し側は settle=true のときだけ入場前に短い遅延を挟み、CLASSサーバ側の旧ウィンドウ
 * 状態が解放されるのを待つ（先頭取得＝settle=false は待ちなしで即入場）。
 */

type Waiter = { token: object; resolve: (r: { settle: boolean }) => void }

// この時間内に別収集が返却していれば「引き継ぎ」とみなし settle を勧める。
const HANDOFF_WINDOW_MS = 3000

let holder: object | null = null
const queue: Waiter[] = []
let lastReleaseAt = 0

/**
 * リースを取得する。空いていれば即時解決。埋まっていればFIFOで待ち、引き渡し時に解決する。
 * settle: 直前に別収集がCLASSを使っていた（引き継ぎ）か。待機列経由は常に true、即時取得でも
 * 直近 HANDOFF_WINDOW_MS 内に返却があれば true（連続入場の competitor が消えた直後）。
 * 同一 token の二重取得は冪等（保持中なら即時解決）。
 */
export function acquireClassLease(token: object): Promise<{ settle: boolean }> {
  if (holder === null || holder === token) {
    const settle = lastReleaseAt > 0 && Date.now() - lastReleaseAt < HANDOFF_WINDOW_MS
    holder = token
    return Promise.resolve({ settle })
  }
  return new Promise((resolve) => {
    queue.push({ token, resolve })
  })
}

/**
 * リースを返却する。保持者なら手放し、待機列の先頭へFIFOで引き渡す（引き渡しは常に settle=true）。
 * 保持していない token でも待機列からは取り除く（取得前に外れた収集の掃除）。二重返却も安全（no-op）。
 */
export function releaseClassLease(token: object): void {
  if (holder === token) {
    holder = null
    lastReleaseAt = Date.now()
  }
  const idx = queue.findIndex((w) => w.token === token)
  if (idx >= 0) queue.splice(idx, 1)
  if (holder === null && queue.length > 0) {
    const next = queue.shift() as Waiter
    holder = next.token
    next.resolve({ settle: true })
  }
}

/** 現在CLASSリースが保持されているか（診断/テスト用）。 */
export function classLeaseBusy(): boolean {
  return holder !== null
}

/** テスト用: リース状態を初期化する。 */
export function _resetClassLease(): void {
  holder = null
  queue.length = 0
  lastReleaseAt = 0
}
