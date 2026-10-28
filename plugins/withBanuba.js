// Banuba Face AR's Agora extension, for the call's virtual backgrounds
// (src/calls/backgrounds.js, src/calls/media.native.js). Added by
// app.config.js only when the build has a Banuba client token
// (BANUBA_CLIENT_TOKEN, an EAS secret); without one the app uses Agora's
// own virtual background and none of this is built in.
//
// Following Banuba's React Native sample (github.com/Banuba/banuba-react-native-agora):
//   Android: Banuba's Maven repository, banuba_sdk and agora-extension, and
//            the effects copied into the app's assets at bnb-resources/effects.
//   iOS:     Banuba's podspec repository, BanubaSdk and
//            BanubaFiltersAgoraExtension, and the effects folder in the bundle.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppBuildGradle, withDangerousMod, withProjectBuildGradle, withXcodeProject } = require('expo/config-plugins');

const VERSIONS = { sdk: '1.17.6', iosSdk: '1.17.7', extension: '2.6.0' };
const MAVEN = 'https://nexus.banuba.net/repository/maven-releases';
const PODSPECS = 'https://github.com/sdk-banuba/banuba-sdk-podspecs.git';
const EFFECTS = path.join('assets', 'banuba', 'effects');
const TAG = '// BOA: Banuba';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

const withMaven = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MAVEN)) {
      // Last in allprojects' list, so every other library still comes from Google and Maven Central first.
      const text = cfg.modResults.contents;
      const open = text.match(/allprojects\s*\{\s*repositories\s*\{/);
      if (open) {
        let depth = 1;
        let i = open.index + open[0].length;
        for (; i < text.length && depth > 0; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
        const close = i - 1; // the repositories block's own closing brace
        cfg.modResults.contents = `${text.slice(0, close).trimEnd()}\n    maven { url '${MAVEN}' } ${TAG}\n  ${text.slice(close)}`;
      }
    }
    return cfg;
  });

const withDependencies = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('com.banuba.sdk')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        (m) => `${m}\n    ${TAG}\n    implementation 'com.banuba.sdk:banuba_sdk:${VERSIONS.sdk}'\n    implementation 'com.banuba.sdk.android:agora-extension:${VERSIONS.extension}'`,
      );
    }
    return cfg;
  });

const withAndroidEffects = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const root = cfg.modRequest.projectRoot;
      copyDir(path.join(root, EFFECTS), path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'bnb-resources', 'effects'));
      return cfg;
    },
  ]);

const withPods = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(file, 'utf8');
      if (!podfile.includes(PODSPECS)) {
        podfile = `source 'https://cdn.cocoapods.org/'\nsource '${PODSPECS}'\n${podfile}`;
        podfile = podfile.replace(/use_expo_modules!\s*\n/, (m) => `${m}  pod 'BanubaSdk', '${VERSIONS.iosSdk}'\n  pod 'BanubaFiltersAgoraExtension', '${VERSIONS.extension}'\n`);
        fs.writeFileSync(file, podfile);
      }
      // The effects, next to the app's sources, for the bundle (withIosEffectsInBundle).
      copyDir(path.join(cfg.modRequest.projectRoot, EFFECTS), path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName, 'effects'));
      return cfg;
    },
  ]);

// The effects folder as a folder reference in the app's resources, so the
// bundle keeps it as effects/<name>/ (where Banuba looks for effects).
const withIosEffectsInBundle = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = cfg.modRequest.projectName;
    const filepath = `${name}/effects`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: name, project, isBuildFile: true });
      const refs = project.pbxFileReferenceSection();
      for (const key of Object.keys(refs)) {
        const ref = refs[key];
        if (ref && typeof ref === 'object' && (ref.path === filepath || ref.path === '"' + filepath + '"' || ref.path === 'effects')) ref.lastKnownFileType = 'folder';
      }
    }
    return cfg;
  });

module.exports = function withBanuba(config) {
  return [withMaven, withDependencies, withAndroidEffects, withPods, withIosEffectsInBundle].reduce((c, fn) => fn(c), config);
};
