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