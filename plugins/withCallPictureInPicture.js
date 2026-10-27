// Lets the main activity go picture in picture, so a BOA video call keeps
// playing in a small window over the home screen and other apps when you
// leave the app mid-call (modules/boa-call: CallPip). Expo has no app.json
// key for it, so this adds android:supportsPictureInPicture at prebuild.
// The activity already handles size changes in place (withAndroidConfigChanges),
// so going in and out of the window never restarts the app.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withCallPictureInPicture(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:supportsPictureInPicture'] = 'true';
    return cfg;
  });
};
