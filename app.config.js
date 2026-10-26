const fs = require('fs');
const path = require('path');

// app.json is the config; this only adds Firebase (FCM) for Android push
// when its google-services.json is available: as an EAS file environment
// variable (GOOGLE_SERVICES_JSON) on the build servers, or in the project
// folder locally. Without it the app still builds; Android just can't get
// a push token, and chat notifications fall back to local ones.
module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const file = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : null);
  if (!file) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
