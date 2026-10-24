// Loads src/data/sleep.js (an ES module) for the Node scripts here. Bundled
// sounds (require()) come back as { bundled: <path> }.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'data');
const src = fs.readFileSync(path.join(dir, 'sleep.js'), 'utf8').replace(/^export /gm, '');
const bundled = (p) => ({ bundled: path.join(dir, p) });
module.exports = new Function('require', `${src}; return { MEDIA_HEADERS, SCENES, SOUNDSCAPES, ZEN_CATEGORIES };`)(bundled);
