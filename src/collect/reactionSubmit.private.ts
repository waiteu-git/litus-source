/**
 * 【公開スタブ】リアクションペーパー提出 actuator。
 *
 * 実際の提出ロジック（②フォームの funcForm:reactionData への本文流し込み・読み戻し検証・
 * 「提出」ボタンの onclick 発火）は、連投ツール化・模倣を避けるため公開版には含めない
 * （attendanceSubmit.private と同じ運用）。実ビルドでは作者が保持する実装でこのファイルを
 * ローカル上書きし、`git update-index --skip-worktree src/collect/reactionSubmit.private.ts` で
 * 追跡から外す（Metro はビルド時に全 import を解決するため、ファイルごと消すとクローンビルドが壊れる。
 * スタブを常設しローカル上書きするこの方式が安全）。
 *
 * 公開クローン/CI ではこのスタブが使われ、アプリ内リアペ提出のみ無効化される（型・ビルド・他機能は通る）。
 * 遷移（OPEN_REACTION_FORM_JS）・sensor・判定（parseReactionMessage）は公開のまま＝透明性は保つ。
 */
export function buildSubmitReactionJs(_text: string): string {
  return `(function(){
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'reaction', stage: 'fill', ok: false, reason: 'stub'
      }));
    } catch (e) {}
    true;
  })();`
}
