import fs from 'fs';
const { getMetaFromUrl } = await import('../svc/fetcher/getMeta.js');

const message = await getMetaFromUrl(
  'http://replay117.valve.net/570/7468445438_1951738768.meta.bz2',
);
// Stats: Original bzip2, 77kb, unzipped, 113kb, parsed JSON 816kb
// fs.writeFileSync(
//   './dev/7468445438_meta.json',
//   JSON.stringify(message, null, 2)
// );
