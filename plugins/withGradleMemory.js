// Gradle's memory and build settings in android/gradle.properties: a 4 GB
// heap with 1 GB of metaspace, parallel project builds and the build cache.
// EAS starts Gradle with the same heap through GRADLE_OPTS (which wins over
// this file there); these keep local and EAS builds alike. On EAS the room
// to build Skia, Banuba and the rest comes from the preview profile's large
// build machine (eas.json resourceClass).
const { withGradleProperties } = require('expo/config-plugins');

const PROPERTIES = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.parallel': 'true',
  'org.gradle.caching': 'true',
};

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
