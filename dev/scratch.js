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
const entries = [];
for (let i = 0; i < 1000000; i += 1) {
  entries.push({
    a: i,
    b: i/7,
    c: "asdf"
  });
}
console.time('JSON');
JSON.parse(JSON.stringify(entries));
console.timeEnd('JSON');
console.time('map');
entries.map(e => Object.assign({}, e));
console.timeEnd('map');