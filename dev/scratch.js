/* eslint-disable */
const request = require('request');
const ProtoBuf = require('protobufjs');
const fs = require('fs');

/*
const files = fs.readdirSync('./proto');
const builder = ProtoBuf.newBuilder();
files.forEach((file) => {
  // console.log(file);
  ProtoBuf.loadProtoFile(`./proto/${file}`, builder);
});
*/

const builder = ProtoBuf.loadProtoFile('./proto/dota_match_metadata.proto');
const Message = builder.build();
const buf = fs.readFileSync('./2750586075_1028519576.meta');
const message = Message.CDOTAMatchMetadataFile.decode(buf);
message.metadata.teams.forEach((team) => {
  team.players.forEach((player) => {
    player.equipped_econ_items.forEach((item) => {
      delete item.attribute;
    });
  });
});
delete message.private_metadata;
console.log(JSON.stringify(message, null, 2));

/*
const redis = require('../store/redis');
const moment = require('moment');
for (let i = 0; i < 100000; i += 1) {
  const metadata = {
    hostname: 'test3',
  };
  const match = {
    match_id: i,
  };
  redis.zadd('retriever', moment().format('X'), `${metadata.hostname}_${match.match_id}`);
}
*/
/*
const entries = [];
for (let i = 0; i < 1000000; i += 1) {
  entries.push({
    a: i,
    b: i / 7,
    c: 'asdf',
  });
}
console.time('JSON');
JSON.parse(JSON.stringify(entries));
console.timeEnd('JSON');
console.time('map');s
entries.map(e => Object.assign({}, e));
console.timeEnd('map');
*/
/*
const request = require('request');
const async = require('async');
async.eachSeries(Array.from(new Array(100), (e, i) => i), (i, cb) => {
  request(`http://localhost:5100?match_id=2716007205`, (err, resp, body) => {
    console.log(i, err, resp && resp.statusCode);
    setTimeout(() => {
      cb(err);
    }, 1000);
  });
}, (err) => (process.exit(Number(err))));
*/
