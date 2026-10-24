// Checks every Sleep & Meditation Hub recording and photograph over the
// network, the way the app fetches them (same User-Agent), and that each
// one is the type of file it should be. Run before a release:
//   npm run verify:media
const { SCENES, SOUNDSCAPES, MEDIA_HEADERS } = require('./sleep-data');

const items = [
  ...SOUNDSCAPES.map((s) => ({ name: `sound  ${s.id}`, uri: s.uri, type: 'audio/mpeg' })),
  ...Object.values(SCENES).map((s) => ({ name: `scene  ${s.id}`, uri: s.uri, type: 'image/jpeg' })),
];

async function check({ name, uri, type }) {
  const res = await fetch(uri, { headers: { ...MEDIA_HEADERS, Range: 'bytes=0-4095' }, redirect: 'follow' });
  const got = (res.headers.get('content-type') || '').split(';')[0];
  const body = Buffer.from(await res.arrayBuffer());
  // MP3: an ID3 tag or an MPEG frame sync. JPEG: FF D8.
  const magic = type === 'audio/mpeg' ? body.slice(0, 3).toString() === 'ID3' || (body[0] === 0xff && (body[1] & 0xe0) === 0xe0) : body[0] === 0xff && body[1] === 0xd8;
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
