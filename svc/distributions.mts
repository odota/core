// Computes rank/mmr distributions and stores in Redis
import fs from 'fs';
import async from 'async';
import constants from 'dotaconstants';
import db from '../store/db.mts';
import redis from '../store/redis.mts';
import utility from '../util/utility.mjs';
import Knex from 'knex';
const { invokeInterval } = utility;
const sql: StringDict = {};
const sqlq = fs.readdirSync('./sql');
sqlq.forEach((f) => {
  sql[f.split('.')[0]] = fs.readFileSync(`./sql/${f}`, 'utf8');
});
function mapMmr(results: any) {
  const sum = results.rows.reduce(
    (prev: any, current: any) => ({
      count: prev.count + current.count,
    }),
    {
      count: 0,
    }
  );
  results.rows = results.rows.map((r: any, i: number) => {
    r.cumulative_sum = results.rows.slice(0, i + 1).reduce(
      (prev: any, current: any) => ({
        count: prev.count + current.count,
      }),
      {
        count: 0,
      }
    ).count;
    return r;
  });
  results.sum = sum;
  return results;
}
function mapCountry(results: any) {
  results.rows = results.rows.map((r: any) => {
    const ref = constants.countries[r.loccountrycode];
    r.common = ref ? ref.name.common : r.loccountrycode;
    return r;
  });
  return results;
}
function loadData(key: string, mapFunc: Function, cb: NonUnknownErrorCb) {
  db.raw(sql[key]).asCallback((err: any, results: any) => {
    if (err) {
      return cb(err);
    }
    return cb(err, mapFunc(results));
  });
}
function doDistributions(cb: ErrorCb) {
  async.parallel(
    {
      country_mmr(cb) {
        loadData('country_mmr', mapCountry, cb);
      },
      mmr(cb) {
        loadData('mmr', mapMmr, cb);
      },
      ranks(cb) {
        loadData('ranks', mapMmr, cb);
      },
    },
    (err, result: any) => {
      if (err) {
        return cb(err);
      }
      Object.keys(result).forEach((key) => {
        redis.set(`distribution:${key}`, JSON.stringify(result[key]));
      });
      return cb(err);
    }
  );
}
invokeInterval(doDistributions, 6 * 60 * 60 * 1000);
