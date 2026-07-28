const { withAppBuildGradle } = require('expo/config-plugins')
const { applyUploadSigning } = require('./releaseSigning')

/**
 * prebuild のたびにテンプレートの release が debug 署名（storePassword 'android'）に戻るため、
 * mod でアップロード鍵の署名設定へ差し替える。鍵の情報は Gradle プロパティから渡す（releaseSigning.js 参照）。
 * プロパティが無い環境では debug 署名のままなので、ベータのローカルビルドは影響を受けない。
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(`withReleaseSigning: 未対応の build.gradle 形式 (${cfg.modResults.language})`)
    }
    cfg.modResults.contents = applyUploadSigning(cfg.modResults.contents)
    return cfg
  })
}
