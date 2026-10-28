const fs = require('fs');
const path = require('path');

// app.json is the config; this only adds Firebase (FCM) for Android push
// when its google-services.json is available: as an EAS file environment
// variable (GOOGLE_SERVICES_JSON) on the build servers, or in the project
// folder locally. Without it the app still builds; Android just can't get
// a push token, and chat notifications fall back to local ones.
//
// BOA_AUTOMOTIVE=1 makes the Android Automotive OS video build instead
// (plugins/withAutomotiveVideo.js). Off by default: the phone build never
// gets it.
//
// BANUBA_CLIENT_TOKEN (an EAS secret; the project's is saved as
// BANBUBA_CLIENT_TOKEN, so either name works) builds in Banuba Face AR for
// the call's virtual backgrounds (plugins/withBanuba.js) and hands the app
// its token. Without it, calls use Agora's own virtual background.
module.exports = ({ config }) => {
  // Android FCM needs a real google-services.json on disk before prebuild
  // runs. GOOGLE_SERVICES_JSON can reach the builder two ways: an EAS
  // file-type variable, where it holds a path EAS has already written, or a
  // secret string, where it holds the JSON itself. In the second case the
  // file doesn't exist yet, so write it out and point at it; prebuild then
  // finds it. With nothing set (local dev) the committed file is used.
  const local = path.join(__dirname, 'google-services.json');
  const env = process.env.GOOGLE_SERVICES_JSON;
  let file = null;
  if (env && env.trim().startsWith('{')) {
    fs.writeFileSync(local, env);
    file = './google-services.json';
  } else if (env) {
    file = env;
  } else if (fs.existsSync(local)) {
    file = './google-services.json';
  }
  let out = config;
  if (file) out = { ...out, android: { ...out.android, googleServicesFile: file } };
  if (process.env.BOA_AUTOMOTIVE === '1') out = { ...out, plugins: [...(out.plugins ?? []), './plugins/withAutomotiveVideo'] };
  const banuba = (process.env.BANUBA_CLIENT_TOKEN || process.env.BANBUBA_CLIENT_TOKEN)?.trim();
  if (banuba) out = { ...out, plugins: [...(out.plugins ?? []), './plugins/withBanuba'], extra: { ...out.extra, banubaToken: banuba } };
  return out;
};
