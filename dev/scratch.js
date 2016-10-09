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
