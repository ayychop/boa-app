// Adds the BOA Radio home screen widget to the Android build at prebuild:
// copies the widget's Kotlin provider and resources (plugins/widget) into
// the generated project and registers the provider in the manifest. No
// third-party widget library, so nothing new runs at app start.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const SOURCE = path.join(__dirname, 'widget');
const RECEIVER = '.BoaWidgetProvider';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function withWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error('withBoaWidget: android.package must be set in app.json');
      const main = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');
      copyDir(path.join(SOURCE, 'res'), path.join(main, 'res'));
      const kotlinDir = path.join(main, 'java', ...pkg.split('.'));
      fs.mkdirSync(kotlinDir, { recursive: true });
      const kotlin = fs.readFileSync(path.join(SOURCE, 'BoaWidgetProvider.kt'), 'utf8').replace('__PACKAGE__', pkg);
      fs.writeFileSync(path.join(kotlinDir, 'BoaWidgetProvider.kt'), kotlin);
      return cfg;
    },
  ]);
}

function withWidgetReceiver(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver = (app.receiver ?? []).filter((r) => r.$['android:name'] !== RECEIVER);
    app.receiver.push({
      $: { 'android:name': RECEIVER, 'android:exported': 'false', 'android:label': '@string/boa_widget_label' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/boa_widget_info' } }],
    });
    return cfg;
  });
}

module.exports = function withBoaWidget(config) {
  return withWidgetReceiver(withWidgetFiles(config));
};
