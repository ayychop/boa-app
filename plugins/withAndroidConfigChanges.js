// Expo has no app.json key for the main activity's configChanges, so this
// plugin adds the ones it's given at prebuild. Handling these changes
// in-process keeps Android from tearing the activity down (and the app with
// it) when a foldable folds or unfolds.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withAndroidConfigChanges(config, { configChanges = [] } = {}) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const existing = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    activity.$['android:configChanges'] = [...new Set([...existing, ...configChanges])].join('|');
    return cfg;
  });
};
