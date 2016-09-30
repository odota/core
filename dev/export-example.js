var zlib = require('zlib'),
  JSONStream = require('JSONStream'),
  fs = require('fs');

const fileName = '../export/dump.json.gz';

const write = fs.createReadStream(fileName);
var JSONStream = JSONStream.parse('*.match_id');

JSONStream.on('data', (d) => {
  console.log(d);
});

write.pipe(zlib.createGunzip()).pipe(JSONStream);

