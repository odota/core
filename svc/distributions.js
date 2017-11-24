const fs = require('fs');
const async = require('async');
const constants = require('dotaconstants');
const db = require('../store/db');
const redis = require('../store/redis');
const utility = require('../util/utility');

const invokeInterval = utility.invokeInterval;

const sql = {};
const sqlq = fs.readdirSync('./sql');
sqlq.forEach((f) => {
  sql[f.split('.')[0]] = fs.readFileSync(`./sql/${f}`, 'utf8');
});

function mapMmr(results) {
  const sum = results.rows.reduce((prev, current) =>
    ({
      count: prev.count + current.count,
    }), {
    count: 0,
  });
  results.rows = results.rows.map((r, i) => {
    r.cumulative_sum = results.rows.slice(0, i + 1).reduce((prev, current) =>
      ({
        count: prev.count + current.count,
      }), {
      count: 0,
    }).count;
    return r;
  });
  results.sum = sum;
  return results;
}

function mapCountry(results) {
  results.rows = results.rows.map((r) => {
    const ref = constants.countries[r.loccountrycode];
    r.common = ref ? ref.name.common : r.loccountrycode;
    return r;
  });
  return results;
}

function loadData(key, mapFunc, cb) {
  db.raw(sql[key]).asCallback((err, results) => {
    if (err) {
      return cb(err);
    }
    return cb(err, mapFunc(results));
  });
}

function doDistributions(cb) {
  async.parallel({
    country_mmr(cb) {
      loadData('country_mmr', mapCountry, cb);
    },
    mmr(cb) {
      loadData('mmr', mapMmr, cb);
    },
    rank_tier(cb) {
      loadData('rank_tier', mapMmr, cb);
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    Object.keys(result).forEach((key) => {
      redis.set(`distribution:${key}`, JSON.stringify(result[key]));
    });
    return cb(err);
  });
}
invokeInterval(doDistributions, 6 * 60 * 60 * 1000);
