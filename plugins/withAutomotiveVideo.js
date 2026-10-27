// The Android Automotive OS (cars with Google built in) build of BOA HUB as
// a parked video app. Off by default: app.config.js only adds this when
// BOA_AUTOMOTIVE=1, so the phone build never changes. The car build goes to
// Play's dedicated Android Automotive OS track, never the phone tracks.
//
// What it changes in the manifest, per Google's requirements:
//  - android:appCategory="video" on the application (the video category).
//  - android.hardware.type.automotive required (a dedicated-track build).
//  - wifi, portrait, landscape and camera (and the camera autofocus the
//    CAMERA permission implies) marked not required, so they don't keep
//    the app off cars without them. tools:replace wins over any library
//    that declares them required.
//  - No distractionOptimized meta-data anywhere: Google forbids it for
//    parked apps, so the car blocks the app while driving.
//  - What the parked-only player (modules/boa-car-video) reads to see the
//    car move: CAR_POWERTRAIN (parking brake and gear, granted at install),
//    CAR_SPEED and fine location (speed and GPS, asked at the first video).
//    GPS hardware marked not required, so cars without it still qualify.
const { withAndroidManifest } = require('expo/config-plugins');

const NOT_REQUIRED = [
  'android.hardware.wifi',
  'android.hardware.screen.portrait',
  'android.hardware.screen.landscape',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.location.gps',
];

// Parked-only video: how the player knows the car is moving.
const CAR_PERMISSIONS = ['android.car.permission.CAR_POWERTRAIN', 'android.car.permission.CAR_SPEED', 'android.permission.ACCESS_FINE_LOCATION'];

function addPermission(manifest, name) {
  manifest['uses-permission'] = manifest['uses-permission'] ?? [];
  if (!manifest['uses-permission'].some((p) => p.$['android:name'] === name)) manifest['uses-permission'].push({ $: { 'android:name': name } });
}

function setFeature(manifest, name, required) {
  manifest['uses-feature'] = (manifest['uses-feature'] ?? []).filter((f) => f.$['android:name'] !== name);
  manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': String(required), 'tools:replace': 'android:required' } });
}

function stripDistractionOptimized(node) {
  if (!node) return;
  if (Array.isArray(node['meta-data'])) node['meta-data'] = node['meta-data'].filter((m) => m.$?.['android:name'] !== 'distractionOptimized');
}

/** The car build's manifest changes, on the parsed AndroidManifest.xml. */
function applyAutomotive(manifest) {
  manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
  setFeature(manifest, 'android.hardware.type.automotive', true);
  NOT_REQUIRED.forEach((name) => setFeature(manifest, name, false));
  CAR_PERMISSIONS.forEach((name) => addPermission(manifest, name));
  const app = manifest.application?.[0];
  if (app) {
    app.$['android:appCategory'] = 'video';
    stripDistractionOptimized(app);
    (app.activity ?? []).forEach(stripDistractionOptimized);
  }
  return manifest;
}

module.exports = function withAutomotiveVideo(config) {
  return withAndroidManifest(config, (cfg) => {
    applyAutomotive(cfg.modResults.manifest);
    return cfg;
  });
};

module.exports.applyAutomotive = applyAutomotive;
module.exports.NOT_REQUIRED = NOT_REQUIRED;
module.exports.CAR_PERMISSIONS = CAR_PERMISSIONS;
