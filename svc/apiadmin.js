const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');

const invokeInterval = utility.invokeInterval;

function storeUsageCounts(cursor, cb) {
  redis.hscan('usage_count', cursor, "COUNT", 1, (err, results) => {
    if (err) {
      console.log('[ERROR] ', err);
      process.exit(1);
    }

    const cursor = results[0];
    const values = results[1];

    async.eachOfLimit(values, 5, (e, i, cb2) => {
      if (i % 2) {
        cb2();
      }
      
      if (e.startsWith('API')) {
        let split = e.split(':');

        db.from('api_keys').where({
          api_key: split[2]
        }).asCallback((err, results) => {
          if (err) {
            cb2(err);  
          }
          
          db('api_key_usage')
            .insert({
              account_id: results[0].account_id,
              api_key: results[0].api_key,
              customer_id: results[0].customer_id,
              ip: split[1],
              usage_count: values[i + 1]
            })
            .asCallback(cb2);
        });
      } else if (e.startsWith('USER')) {
        let split = e.split(':');

        db('user_usage')
          .insert({
            ip: split[1],
            account_id: split[2],
            usage_count: values[i + 1]
          })
          .asCallback(cb2);
      }
    }, (err) => {
      if (err) {  
        console.error('[ERROR] ', err);
        process.exit(1);
      }
      
      storeUsageCounts(cursor, cb);
    });
  });
}
    // async.parallel(
    //   {
    //     usage: cb => async.mapLimit(results[1], 20, (e, cb2) => redis.get(e, cb2), cb),
    //     keyInfo: cb => async.mapLimit(results[1], 20, (e, cb2) => {
    //       db.from('api_keys').where({
    //         api_key: e.replace('api_count_limit:', ''),
    //       }).asCallback(cb2);
    //     }, cb),
    //   },
    //   (err, results) => {
    //     if (err) {
    //       console.error('[ERROR] ', err);
    //       process.exit(1);
    //     }

    //     db('api_key_usage')
    //       .insert(results.keyInfo.map((e, i) => ({
    //         account_id: e[0].account_id,
    //         api_key: e[0].api_key,
    //         customer_id: e[0].customer_id,
    //         usage_count: results.usage[i],
    //       })))
    //       .asCallback((err) => {
    //         if (err) {
    //           console.error('[ERROR] ', err);
    //           process.exit(1);
    //         }

    //         if (cursor !== '0') {
    //           storeUsageCounts(cursor, cb);
    //         } else {
    //           cb();
    //         }
    //       });
    //   },
    // );

invokeInterval((cb) => storeUsageCounts(0, cb), 10 * 60 * 1000); // Every 10 minutes
