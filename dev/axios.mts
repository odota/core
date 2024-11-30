import axios from 'axios';
import { gunzipSync } from 'zlib';

const resp = await axios.get<Buffer>(
  'https://f005.backblazeb2.com/file/opendota-blobs/5984386492_api',
  { responseType: 'arraybuffer' },
);
let buffer = resp.data;
console.log(buffer);
const unzip = gunzipSync(buffer);
console.log(unzip);
