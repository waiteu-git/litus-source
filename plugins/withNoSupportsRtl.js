const { withAndroidManifest } = require('expo/config-plugins')
const { setSupportsRtlFalse } = require('./supportsRtl')

/** prebuild のたびにテンプレート由来の android:supportsRtl="true" が復活するため、mod で落とす。 */
module.exports = function withNoSupportsRtl(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = setSupportsRtlFalse(cfg.modResults)
    return cfg
  })
}
