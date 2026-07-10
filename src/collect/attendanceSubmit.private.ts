/**
 * 【公開スタブ】出席送信 actuator。
 *
 * 実際の送信ロジック（認証コード流し込み・本物ボタンの onclick 発火・確認ダイアログ自動化）は、
 * 連投ツール化・模倣を避けるため公開版には含めない。実ビルドでは作者が保持する実装でこのファイルを
 * ローカル上書きし、`git update-index --skip-worktree src/collect/attendanceSubmit.private.ts` で
 * 追跡から外す（Metro はビルド時に全 import を解決するため、ファイルごと消すとクローンビルドが壊れる。
 * スタブを常設しローカル上書きするこの方式が安全）。
 *
 * 公開クローン/CI ではこのスタブが使われ、出席送信のみ無効化される（型・ビルド・他機能は通る）。
 * sensor（DETECT_*）・遷移（OPEN_*）・parser は injectedScripts に公開のまま＝透明性は保つ。
 */
export function buildSubmitAttendanceJs(_code: string): string {
  return `(function(){
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'submit',
        result: 'この公開ビルドでは出席送信は無効化されています',
        ok: false, wrong: false, err: false, btnFound: false,
        values: [], method: 'stub', onclick: ''
      }));
    } catch (e) {}
    true;
  })();`
}
