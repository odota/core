const zlib = require('zlib');
const JSONStream = require('JSONStream');
const fs = require('fs');

const fileName = '../export/dump.json.gz';
const write = fs.createReadStream(fileName);
const stream = JSONStream.parse('*.match_id');

stream.on('data', (d) => {
  console.log(d);
});

write.pipe(zlib.createGunzip()).pipe(JSONStream);
