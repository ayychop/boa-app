// Loads src/data/sleep.js (an ES module) for the Node scripts here.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'sleep.js'), 'utf8').replace(/^export /gm, '');
module.exports = new Function(`${src}; return { MEDIA_HEADERS, SCENES, SOUNDSCAPES };`)();
