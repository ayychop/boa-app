// Checks every Zen recording, photograph and video over the
// network, the way the app fetches them (same User-Agent), and that each
// one is the type of file it should be. Run before a release:
//   npm run verify:media
const { SCENES, SOUNDSCAPES, MEDIA_HEADERS } = require('./sleep-data');

const items = [
  ...SOUNDSCAPES.map((s) => ({ name: `sound  ${s.id}`, uri: s.uri, type: 'audio/mpeg' })),
  ...Object.values(SCENES).map((s) => ({ name: `photo  ${s.id}`, uri: s.uri, type: 'image/jpeg' })),
  ...Object.values(SCENES).map((s) => ({ name: `video  ${s.id} (Android, web)`, uri: s.video.uri, type: 'video/webm' })),
  ...Object.values(SCENES).map((s) => ({ name: `video  ${s.id} (iOS)`, uri: s.video.ios, type: 'video/quicktime' })),
];

// The first bytes of each kind of file.
const MAGIC = {
  'audio/mpeg': (b) => b.slice(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  // WebM is Matroska: EBML header 1A 45 DF A3.
  'video/webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  // QuickTime/MP4: an atom size, then a type such as ftyp, moov or wide.
  'video/quicktime': (b) => ['ftyp', 'moov', 'wide', 'mdat', 'free'].includes(b.slice(4, 8).toString()),
};

async function check({ name, uri, type }) {
  const res = await fetch(uri, { headers: { ...MEDIA_HEADERS, Range: 'bytes=0-4095' }, redirect: 'follow' });
  const got = (res.headers.get('content-type') || '').split(';')[0];
  const body = Buffer.from(await res.arrayBuffer());
  const magic = MAGIC[type](body);
  const ok = (res.status === 200 || res.status === 206) && got === type && magic;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}  ${res.status} ${got} ${magic ? 'valid header' : 'bad header'}`);
  return ok;
}

(async () => {
  const results = [];
  for (const item of items) results.push(await check(item).catch((e) => (console.log(`FAIL ${item.name}  ${e.message}`), false)));
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} of ${items.length} failed` : `\nAll ${items.length} media files reachable and valid.`);
  process.exit(failed ? 1 : 0);
})();
