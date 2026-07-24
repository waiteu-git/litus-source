const { withEntitlementsPlist } = require('expo/config-plugins')
const { stripApsEnvironment } = require('./apsEnvironment')

/**
 * expo-notifications の config plugin が iOS entitlements へ無条件に書き込む
 * `aps-environment` を落とす（理由は apsEnvironment.js のコメント）。
 * **app.json の plugins では expo-notifications より「前」に置くこと**（mod は登録の逆順に走る）。
 */
module.exports = function withNoApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults = stripApsEnvironment(cfg.modResults)
    return cfg
  })
}
