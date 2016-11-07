const config = require('../config');
const isRadiant = require('../utility').isRadiant;
const pg = require('knex')({
  client: 'pg',
  connection: config.POSTGRES_URL,
});
const MongoClient = require('mongodb').MongoClient;
const url = config.MONGO_URL;
const queries = require('../queries');
const insertMatch = queries.insertMatch;
const insertPlayer = queries.insertPlayer;
const redis = require('../redis');
const queue = require('../queue');
const args = process.argv.slice(2);
const start_id = Number(args[1] || 0);
const async = require('async');
const fs = require('fs');

const fileName = `migration-${args[0]}-${new Date()}.log`;

MongoClient.connect(url, (err, db) => {
  if (err) {
    throw err;
  }
  const args = process.argv.slice(2);
  let cursor;
  let migrate;
  if (args[0] === 'matches') {
    cursor = db.collection('matches').find({
      match_id: {
        $gt: start_id,
      },
    }).sort({
      match_id: 1,
    });
    migrate = processMatch;
  } else if (args[0] === 'players') {
    cursor = db.collection('players').find({
      account_id: {
        $gt: start_id,
      },
    }).sort({
      account_id: 1,
    });
    migrate = processPlayer;
  } else {
    throw 'invalid option, choose matches or players';
  }
  cursor.nextObject(processItem);

  function processItem(err, item) {
    if (err) {
      console.error(item);
      throw err;
    }
    if (!item) {
      process.exit(0); // All done!
    }
    migrate(item, (err) => {
      if (err) {
        throw err;
      }
      process.nextTick(() => {
        cursor.nextObject(processItem);
      });
    });
  }

  function processMatch(m, cb) {
        // compute match radiant gold/xp adv for matches that don't have it
    if (m.parsed_data && !m.parsed_data.radiant_gold_adv && m.parsed_data.players && m.parsed_data.players.times) {
      m.parsed_data.radiant_gold_adv = [];
      m.parsed_data.radiant_xp_adv = [];
      for (let i = 0; i < m.parsed_data.players[0].times.length; i++) {
        let goldtotal = 0;
        let xptotal = 0;
        m.players.forEach((elem, j) => {
          const p = m.parsed_data.players[j];
          if (isRadiant(elem)) {
            goldtotal += p.gold[i];
            xptotal += p.xp[i];
          } else {
            xptotal -= p.xp[i];
            goldtotal -= p.gold[i];
          }
        });
        if (!isNaN(goldtotal)) {
          m.parsed_data.radiant_gold_adv.push(goldtotal);
        }
        if (!isNaN(xptotal)) {
          m.parsed_data.radiant_xp_adv.push(xptotal);
        }
      }
    }
    if (m.parsed_data && m.parsed_data.teamfights) {
      m.parsed_data.teamfights.forEach((tf) => {
        tf.players.forEach((tfp) => {
          tfp.killed = tfp.kills;
          delete tfp.kills;
        });
      });
    }
    if (m.players) {
      m.players = m.players.map((pm) => {
        const parseSlot = pm.player_slot % (128 - 5);
        const pp = m.parsed_data && m.parsed_data.players ? m.parsed_data.players[parseSlot] : null;
        if (pp) {
          pm.gold_t = pp.gold;
          pm.xp_t = pp.xp;
          pm.lh_t = pp.lh;
          pm.killed = pp.kills;
          for (const key in pp) {
            if (!(key in pm) && pp && pp[key]) {
              pm[key] = pp[key];
            }
          }
        }
        return pm;
      });
    }
    if (m.parsed_data) {
      for (const key in m.parsed_data) {
        if (!(key in m) && m.parsed_data[key]) {
          m[key] = m.parsed_data[key];
        }
      }
    }
    m.parse_status = m.parsed_data ? 2 : null;
    console.log(m.match_id);
    insertMatch(pg, redis, queue, m, {
      type: 'api',
    }, cb);
  }

  function processPlayer(p, cb) {
    p.last_login = p.last_visited;
    delete p.last_visited;
    let ratings = JSON.parse(JSON.stringify(p.ratings || []));
    ratings = ratings.map(r =>
       ({
         solo_competitive_rank: r.soloCompetitiveRank,
         competitive_rank: r.competitiveRank,
         time: r.time,
         match_id: r.match_id,
         account_id: p.account_id,
       })
    );
    delete p.ratings;
    console.log(p.account_id);
    insertPlayer(pg, p, (err) => {
      if (err) {
        return cb(err);
      }

      async.each(ratings, (elem, cb) => {
        pg('player_ratings').insert(elem).asCallback((err) => {
                    // next doc
          if (err) {
            fs.appendFile(fileName, `${err}\n`, cb);
          } else {
            cb();
          }
        });
      }, () => {
        cb();
      });
    });
  }
});
