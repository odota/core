/**
 * Provides functions to get/insert data into data stores.
 * */
const async = require('async');
const constants = require('dotaconstants');
const util = require('util');
const utility = require('../util/utility');
const config = require('../config');
const queue = require('./queue');
const su = require('../util/scenariosUtil');
const filter = require('../util/filter');
const compute = require('../util/compute');
const db = require('../store/db');
const redis = require('../store/redis');
const { es, INDEX } = require('../store/elasticsearch');
const cassandra = require('../store/cassandra');
const cacheFunctions = require('./cacheFunctions');
const benchmarksUtil = require('../util/benchmarksUtil');

const {
  redisCount, convert64to32, serialize, deserialize, isRadiant, isContributor,
} = utility;
const { computeMatchData } = compute;
const columnInfo = {};
const cassandraColumnInfo = {};
const { benchmarks } = benchmarksUtil;

function doCleanRow(err, schema, row, cb) {
  if (err) {
    return cb(err);
  }
  const obj = {};
  Object.keys(row).forEach((key) => {
    if (key in schema) {
      obj[key] = row[key];
    }
  });
  return cb(err, obj);
}

function cleanRowPostgres(db, table, row, cb) {
  if (columnInfo[table]) {
    return doCleanRow(null, columnInfo[table], row, cb);
  }
  return db(table).columnInfo().asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    columnInfo[table] = result;
    return doCleanRow(err, columnInfo[table], row, cb);
  });
}

function cleanRowCassandra(cassandra, table, row, cb) {
  if (cassandraColumnInfo[table]) {
    return doCleanRow(null, cassandraColumnInfo[table], row, cb);
  }
  return cassandra.execute(
    'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?', [config.NODE_ENV === 'test' ? 'yasp_test' : 'yasp', table],
    (err, result) => {
      if (err) {
        return cb(err);
      }
      cassandraColumnInfo[table] = {};
      result.rows.forEach((r) => {
        cassandraColumnInfo[table][r.column_name] = 1;
      });
      return doCleanRow(err, cassandraColumnInfo[table], row, cb);
    },
  );
}

function getWebhooks(db) {
  return db.select('url', 'subscriptions').from('webhooks').stream();
}

function getAPIKeys(db, cb) {
  db.raw(`
    SELECT api_key from api_keys WHERE api_key is not null
    `).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}

/**
 * Benchmarks a match against stored data in Redis.
 * */
function getMatchBenchmarks(m, cb) {
  async.map(m.players, (p, cb) => {
    p.benchmarks = {};
    async.eachSeries(Object.keys(benchmarks), (metric, cb) => {
      // Use data from previous epoch
      let key = ['benchmarks', utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, -1), metric, p.hero_id].join(':');
      const backupKey = ['benchmarks', utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 0), metric, p.hero_id].join(':');
      const raw = benchmarks[metric](m, p);
      p.benchmarks[metric] = {
        raw,
      };
      redis.exists(key, (err, exists) => {
        if (err) {
          return cb(err);
        }
        if (exists === 0) {
          // No data, use backup key (current epoch)
          key = backupKey;
        }
        return redis.zcard(key, (err, card) => {
          if (err) {
            return cb(err);
          }
          if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
            return redis.zcount(key, '0', raw, (err, count) => {
              if (err) {
                return cb(err);
              }
              const pct = count / card;
              p.benchmarks[metric].pct = pct;
              return cb(err);
            });
          }
          p.benchmarks[metric] = {};
          return cb();
        });
      });
    }, cb);
  }, cb);
}

async function getMatchBenchmarksPromisified(m) {
  return new Promise((resolve, reject) => {
    getMatchBenchmarks(m, (err) => {
      if (err) {
        return reject(err);
      }
      return resolve(m);
    });
  });
}

function getDistributions(redis, cb) {
  const keys = ['distribution:ranks', 'distribution:mmr', 'distribution:country_mmr'];
  const result = {};
  async.each(keys, (r, cb) => {
    redis.get(r, (err, blob) => {
      if (err) {
        return cb(err);
      }
      result[r.split(':')[1]] = JSON.parse(blob);
      return cb(err);
    });
  }, err => cb(err, result));
}

function getProPlayers(db, redis, cb) {
  db.raw(`
    SELECT * from notable_players
    `).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}

function getLeaderboard(db, redis, key, n, cb) {
  redis.zrevrangebyscore(key, 'inf', '-inf', 'WITHSCORES', 'LIMIT', '0', n, (err, rows) => {
    if (err) {
      return cb(err);
    }
    const entries = rows.map((r, i) => ({
      account_id: r,
      score: rows[i + 1],
    })).filter((r, i) => i % 2 === 0);
    const accountIds = entries.map(r => r.account_id);
    // get player data from DB
    return db.select().from('players').whereIn('account_id', accountIds).asCallback((err, names) => {
      if (err) {
        return cb(err);
      }
      const obj = {};
      names.forEach((n) => {
        obj[n.account_id] = n;
      });
      entries.forEach((e) => {
        Object.keys(obj[e.account_id]).forEach((key) => {
          e[key] = e[key] || obj[e.account_id][key];
        });
      });
      return cb(err, entries);
    });
  });
}

function getHeroRankings(db, redis, heroId, options, cb) {
  db.raw(`
  SELECT players.account_id, score, personaname, name, avatar, last_login, rating as rank_tier
  from hero_ranking
  join players using(account_id)
  left join notable_players using(account_id)
  left join rank_tier using(account_id)
  WHERE hero_id = ?
  ORDER BY score DESC
  LIMIT 100
  `, [heroId || 0]).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    const entries = result.rows;
    return cb(err, {
      hero_id: Number(heroId),
      rankings: entries,
    });
  });
}

function getHeroBenchmarks(db, redis, options, cb) {
  const heroId = options.hero_id;
  const ret = {};
  async.each(Object.keys(benchmarks), (metric, cb) => {
    const arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
    async.each(arr, (percentile, cb) => {
      // Use data from previous epoch
      let key = ['benchmarks', utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, -1), metric, heroId].join(':');
      const backupKey = ['benchmarks', utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 0), metric, heroId].join(':');
      redis.exists(key, (err, exists) => {
        if (err) {
          return cb(err);
        }
        if (exists === 0) {
          // No data, use backup key (current epoch)
          key = backupKey;
        }
        return redis.zcard(key, (err, card) => {
          if (err) {
            return cb(err);
          }
          const position = Math.floor(card * percentile);
          return redis.zrange(key, position, position, 'WITHSCORES', (err, result) => {
            const obj = {
              percentile,
              value: Number(result[1]),
            };
            if (!ret[metric]) {
              ret[metric] = [];
            }
            ret[metric].push(obj);
            cb(err, obj);
          });
        });
      });
    }, cb);
  }, err => cb(err, {
    hero_id: Number(heroId),
    result: ret,
  }));
}

function getMmrEstimate(accountId, cb) {
  db.first('estimate').from('mmr_estimates').where({ account_id: accountId }).asCallback(cb);
}

function getPlayerMatches(accountId, queryObj, cb) {
  // Validate accountId
  if (!accountId || Number.isNaN(Number(accountId)) || Number(accountId) <= 0) {
    return cb(null, []);
  }
  // call clean method to ensure we have column info cached
  return cleanRowCassandra(cassandra, 'player_caches', {}, (err) => {
    if (err) {
      return cb(err);
    }
    // console.log(queryObj.project, cassandraColumnInfo.player_caches);
    const query = util.format(
      `
      SELECT %s FROM player_caches
      WHERE account_id = ?
      ORDER BY match_id DESC
      ${queryObj.dbLimit ? `LIMIT ${queryObj.dbLimit}` : ''}
    `,
      queryObj.project.filter(f => cassandraColumnInfo.player_caches[f]).join(','),
    );
    const matches = [];
    return cassandra.eachRow(
      query, [accountId], {
        prepare: true,
        fetchSize: 5000,
        autoPage: true,
      },
      (n, row) => {
        const m = deserialize(row);
        if (filter([m], queryObj.filter).length) {
          matches.push(m);
        }
      },
      (err) => {
        if (err) {
          return cb(err);
        }
        if (queryObj.sort) {
          matches.sort((a, b) => b[queryObj.sort] - a[queryObj.sort]);
        }
        const offset = matches.slice(queryObj.offset);
        const result = offset.slice(0, queryObj.limit || offset.length);
        return cb(err, result);
      },
    );
  });
}

function getPlayerRatings(db, accountId, cb) {
  if (!Number.isNaN(Number(accountId))) {
    db.from('player_ratings').where({
      account_id: Number(accountId),
    }).orderBy('time', 'asc').asCallback((err, result) => {
      cb(err, result);
    });
  } else {
    cb();
  }
}

function getPlayerHeroRankings(accountId, cb) {
  db.raw(`
  SELECT
  hero_id,
  playerscore.score,
  count(1) filter (where hr.score <= playerscore.score)::float/count(1) as percent_rank,
  count(1) * 250 card
  FROM (select * from hero_ranking TABLESAMPLE SYSTEM(0.4)) hr
  JOIN (select hero_id, score from hero_ranking hr2 WHERE account_id = ?) playerscore using (hero_id)
  GROUP BY hero_id, playerscore.score
  ORDER BY percent_rank desc
  `, [accountId]).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}

function getPlayer(db, accountId, cb) {
  if (!Number.isNaN(Number(accountId))) {
    db.first('players.account_id', 'personaname', 'name', 'plus', 'cheese', 'steamid', 'avatar', 'avatarmedium', 'avatarfull', 'profileurl', 'last_login', 'loccountrycode')
      .from('players')
      .leftJoin('notable_players', 'players.account_id', 'notable_players.account_id')
      .where({
        'players.account_id': Number(accountId),
      })
      .asCallback(cb);
  } else {
    cb();
  }
}

function getPeers(db, input, player, cb) {
  if (!input) {
    return cb();
  }
  let teammatesArr = [];
  const teammates = input;
  Object.keys(teammates).forEach((id) => {
    const tm = teammates[id];
    const numId = Number(id);
    // don't include if anonymous, self or if few games together
    if (numId
      && numId !== Number(player.account_id)
      && numId !== utility.getAnonymousAccountId()
      && tm.games >= 5) {
      teammatesArr.push(tm);
    }
  });
  teammatesArr.sort((a, b) => b.games - a.games);
  // limit to 200 max players
  teammatesArr = teammatesArr.slice(0, 200);
  return async.each(teammatesArr, (t, cb) => {
    db.first('players.account_id', 'personaname', 'name', 'avatar', 'avatarfull', 'last_login')
      .from('players')
      .leftJoin('notable_players', 'players.account_id', 'notable_players.account_id')
      .where({
        'players.account_id': t.account_id,
      })
      .asCallback((err, row) => {
        if (err || !row) {
          return cb(err);
        }
        t.personaname = row.personaname;
        t.name = row.name;
        t.is_contributor = isContributor(t.account_id);
        t.last_login = row.last_login;
        t.avatar = row.avatar;
        t.avatarfull = row.avatarfull;
        return cb(err);
      });
  }, (err) => {
    cb(err, teammatesArr);
  });
}

function getProPeers(db, input, player, cb) {
  if (!input) {
    return cb();
  }
  const teammates = input;
  return db.raw(`select *, notable_players.account_id
          FROM notable_players
          LEFT JOIN players
          ON notable_players.account_id = players.account_id
          `).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    const arr = result.rows.map(r => Object.assign({}, r, teammates[r.account_id]))
      .filter(r => (r.account_id !== player.account_id) && r.games)
      .sort((a, b) => b.games - a.games);
    return cb(err, arr);
  });
}

function getMatchRating(match, cb) {
  async.map(match.players, (player, cb) => {
    if (!player.account_id) {
      return cb();
    }
    return db.first().from('solo_competitive_rank').where({ account_id: player.account_id }).asCallback((err, row) => {
      cb(err, row ? row.rating : null);
    });
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    // Remove undefined/null values
    const filt = result.filter(r => r);
    const avg = Math.floor(filt.map(r => Number(r)).reduce((a, b) => a + b, 0) / filt.length);
    return cb(err, avg, filt.length);
  });
}

function getMatchRankTier(match, cb) {
  async.map(match.players, (player, cb) => {
    if (!player.account_id) {
      return cb();
    }
    return db.first().from('rank_tier').where({ account_id: player.account_id }).asCallback((err, row) => {
      cb(err, row ? row.rating : null);
    });
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    // Remove undefined/null values
    const filt = result.filter(r => r);
    const avg = Math.floor(filt.map(r => Number(r)).reduce((a, b) => a + b, 0) / filt.length);
    return cb(err, avg, filt.length);
  });
}

function upsert(db, table, row, conflict, cb) {
  cleanRowPostgres(db, table, row, (err, row) => {
    if (err) {
      return cb(err);
    }
    const values = Object.keys(row).map(() => '?');
    const update = Object.keys(row).map(key => util.format('%s=%s', key, `EXCLUDED.${key}`));
    const query = util.format(
      'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s',
      table,
      Object.keys(row).join(','),
      values,
      Object.keys(conflict).join(','),
      update.join(','),
    );
    return db.raw(query, Object.keys(row).map(key => row[key])).asCallback(cb);
  });
}

function insertPlayer(db, player, indexPlayer, cb) {
  if (player.steamid) {
    // this is a login, compute the account_id from steamid
    player.account_id = Number(convert64to32(player.steamid));
  }
  if (!player.account_id || player.account_id === utility.getAnonymousAccountId()) {
    return cb();
  }

  if (indexPlayer) {
    es.update({
      index: INDEX,
      type: 'player',
      id: player.account_id,
      body: {
        doc: {
          personaname: player.personaname,
          avatarfull: player.avatarfull,
        },
        doc_as_upsert: true,
      },
    }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }

  return upsert(db, 'players', player, {
    account_id: player.account_id,
  }, cb);
}

function bulkIndexPlayer(bulkActions, cb) {
  // Bulk call to ElasticSearch
  if (bulkActions.length > 0) {
    es.bulk({
      body: bulkActions,
      index: INDEX,
      type: 'player',
    }, cb);
  }
}

function insertPlayerRating(db, row, cb) {
  async.series({
    pr(cb) {
      if (row.solo_competitive_rank || row.competitive_rank) {
        db('player_ratings').insert({
          account_id: row.account_id,
          match_id: row.match_id,
          time: row.time,
          solo_competitive_rank: row.solo_competitive_rank,
          competitive_rank: row.competitive_rank,
        }).asCallback(cb);
      } else {
        cb();
      }
    },
    scr(cb) {
      if (row.solo_competitive_rank) {
        upsert(db, 'solo_competitive_rank', { account_id: row.account_id, rating: row.solo_competitive_rank }, { account_id: row.account_id }, cb);
      } else {
        cb();
      }
    },
    cr(cb) {
      if (row.competitive_rank) {
        upsert(db, 'competitive_rank', { account_id: row.account_id, rating: row.competitive_rank }, { account_id: row.account_id }, cb);
      } else {
        cb();
      }
    },
    rt(cb) {
      if (row.rank_tier) {
        upsert(db, 'rank_tier', { account_id: row.account_id, rating: row.rank_tier }, { account_id: row.account_id }, cb);
      } else {
        cb();
      }
    },
    lr(cb) {
      if (row.leaderboard_rank) {
        upsert(db, 'leaderboard_rank', { account_id: row.account_id, rating: row.leaderboard_rank }, { account_id: row.account_id }, cb);
      } else {
        cb();
      }
    },
  }, cb);
}

function insertMatchSkillCassandra(row, cb) {
  cassandra.execute(
    'UPDATE matches SET skill = ? WHERE match_id = ? IF EXISTS', [row.skill, row.match_id], { prepare: true },
    (err) => {
      if (err) {
        return cb(err);
      }
      if (row.players) {
        const filteredPlayers = row.players.filter(player => player.account_id
          && player.account_id !== utility.getAnonymousAccountId());
        return async.eachSeries(filteredPlayers, (player, cb) => {
          cassandra.execute(
            'UPDATE player_caches SET skill = ? WHERE account_id = ? AND match_id = ? IF EXISTS', [String(row.skill), String(player.account_id), String(row.match_id)], { prepare: true },
            cb,
          );
        }, cb);
      }
      return cb();
    },
  );
}

function writeCache(accountId, cache, cb) {
  return async.each(cache.raw, (match, cb) => {
    cleanRowCassandra(cassandra, 'player_caches', match, (err, cleanedMatch) => {
      if (err) {
        return cb(err);
      }
      const serializedMatch = serialize(cleanedMatch);
      const query = util.format(
        'INSERT INTO player_caches (%s) VALUES (%s)',
        Object.keys(serializedMatch).join(','),
        Object.keys(serializedMatch).map(() => '?').join(','),
      );
      const arr = Object.keys(serializedMatch).map(k => serializedMatch[k]);
      return cassandra.execute(query, arr, {
        prepare: true,
      }, cb);
    });
  }, cb);
}

function insertPlayerCache(match, cb) {
  const { players } = match;
  if (match.pgroup && players) {
    players.forEach((p) => {
      if (match.pgroup[p.player_slot]) {
        // add account id to each player so we know what caches to update
        p.account_id = match.pgroup[p.player_slot].account_id;
        // add hero_id to each player so we update records with hero played
        p.hero_id = match.pgroup[p.player_slot].hero_id;
      }
    });
  }
  return async.eachSeries(players, (playerMatch, cb) => {
    if (playerMatch.account_id && playerMatch.account_id !== utility.getAnonymousAccountId()) {
      // join player with match to form player_match
      Object.keys(match).forEach((key) => {
        if (key !== 'players') {
          playerMatch[key] = match[key];
        }
      });
      computeMatchData(playerMatch);
      return writeCache(playerMatch.account_id, {
        raw: [playerMatch],
      }, cb);
    }
    return cb();
  }, cb);
}

async function updateTeamRankings(match, options) {
  if (options.origin === 'scanner' && match.radiant_team_id && match.dire_team_id && match.radiant_win !== undefined) {
    const team1 = match.radiant_team_id;
    const team2 = match.dire_team_id;
    const team1Win = Number(match.radiant_win);
    const kFactor = 32;
    const data1 = await db.select('rating').from('team_rating').where({ team_id: team1 });
    const data2 = await db.select('rating').from('team_rating').where({ team_id: team2 });
    const currRating1 = Number((data1 && data1[0] && data1[0].rating) || 1000);
    const currRating2 = Number((data2 && data2[0] && data2[0].rating) || 1000);
    const r1 = 10 ** (currRating1 / 400);
    const r2 = 10 ** (currRating2 / 400);
    const e1 = r1 / (r1 + r2);
    const e2 = r2 / (r1 + r2);
    const win1 = team1Win;
    const win2 = Number(!team1Win);
    const ratingDiff1 = kFactor * (win1 - e1);
    const ratingDiff2 = kFactor * (win2 - e2);
    const query = `INSERT INTO team_rating(team_id, rating, wins, losses, last_match_time) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET team_id=team_rating.team_id, rating=team_rating.rating + ?, wins=team_rating.wins + ?, losses=team_rating.losses + ?, last_match_time=?`;
    await db.raw(query, [
      team1, currRating1 + ratingDiff1, win1, Number(!win1), match.start_time,
      ratingDiff1, win1, Number(!win1), match.start_time,
    ]);
    await db.raw(query, [
      team2, currRating2 + ratingDiff2, win2, Number(!win2), match.start_time,
      ratingDiff2, win2, Number(!win2), match.start_time,
    ]);
  }
}

function createMatchCopy(match, players) {
  const copy = JSON.parse(JSON.stringify(match));
  copy.players = JSON.parse(JSON.stringify(players));
  return copy;
}

function insertMatch(match, options, cb) {
  const players = match.players ? JSON.parse(JSON.stringify(match.players)) : undefined;
  const abilityUpgrades = [];
  const savedAbilityLvls = {
    5288: 'track',
    5368: 'greevils_greed',
  };

  function preprocess(cb) {
    // don't insert anonymous account id
    if (players) {
      players.forEach((p) => {
        if (p.account_id === utility.getAnonymousAccountId()) {
          delete p.account_id;
        }
      });
    }
    // if we have a pgroup from earlier, use it to fill out hero_ids (used after parse)
    if (players && match.pgroup) {
      players.forEach((p) => {
        if (match.pgroup[p.player_slot]) {
          p.hero_id = match.pgroup[p.player_slot].hero_id;
        }
      });
    }
    // build match.pgroup so after parse we can figure out the account_ids for each slot
    if (players && !match.pgroup) {
      match.pgroup = {};
      players.forEach((p) => {
        match.pgroup[p.player_slot] = {
          account_id: p.account_id || null,
          hero_id: p.hero_id,
          player_slot: p.player_slot,
        };
      });
    }
    // ability_upgrades_arr
    if (players) {
      players.forEach((p) => {
        if (p.ability_upgrades) {
          p.ability_upgrades_arr = p.ability_upgrades.map(au => au.ability);
          const abilityLvls = {};
          p.ability_upgrades.forEach((au) => {
            if (au.ability in savedAbilityLvls) {
              abilityLvls[au.ability] = (abilityLvls[au.ability] || 0) + 1;
              const abilityUpgrade = Object.assign({}, au, {
                level: abilityLvls[au.ability],
              });
              abilityUpgrades.push(abilityUpgrade);
            }
          });
        }
      });
    }
    cb();
  }

  function tellFeed(cb) {
    if (options.origin === 'scanner' || options.doTellFeed) {
      redis.xadd('feed', 'maxlen', '~', '10000', '*', 'data', JSON.stringify({ ...match, origin: options.origin }), cb);
    } else {
      cb();
    }
  }

  function decideLogParse(cb) {
    if (match.leagueid) {
      db.select('leagueid')
        .from('leagues')
        .where('tier', 'premium')
        .orWhere('tier', 'professional')
        .asCallback((err, leagueids) => {
          if (err) {
            return cb(err);
          }
          options.doLogParse = options.doLogParse
            || utility.isProMatch(match, leagueids.map(l => l.leagueid));
          return cb(err);
        });
    } else {
      cb();
    }
  }

  function updateMatchGcData(cb) {
    if (options.type === 'gcdata') {
      db.raw('UPDATE matches SET series_id = ?, series_type = ? WHERE match_id = ?', [match.series_id, match.series_type, match.match_id]).asCallback(cb);
    } else {
      cb();
    }
  }

  function upsertMatch(cb) {
    if (!options.doLogParse) {
      // Skip this if not a pro match (doLogParse true) and not inserting gcdata (series_id/type)
      return cb();
    }
    // console.log('[INSERTMATCH] upserting into Postgres');
    return db.transaction((trx) => {
      function upsertMatch(cb) {
        upsert(trx, 'matches', match, {
          match_id: match.match_id,
        }, cb);
      }

      function upsertPlayerMatches(cb) {
        async.each(players || [], (pm, cb) => {
          pm.match_id = match.match_id;
          // Add lane data
          if (pm.lane_pos) {
            const laneData = utility.getLaneFromPosData(pm.lane_pos, isRadiant(pm));
            pm.lane = laneData.lane || null;
            pm.lane_role = laneData.lane_role || null;
            pm.is_roaming = laneData.is_roaming || null;
          }
          upsert(trx, 'player_matches', pm, {
            match_id: pm.match_id,
            player_slot: pm.player_slot,
          }, cb);
        }, cb);
      }

      function upsertPicksBans(cb) {
        async.each(match.picks_bans || [], (p, cb) => {
          // order is a reserved keyword
          p.ord = p.order;
          p.match_id = match.match_id;
          upsert(trx, 'picks_bans', p, {
            match_id: p.match_id,
            ord: p.ord,
          }, cb);
        }, cb);
      }

      function upsertMatchPatch(cb) {
        if (match.start_time) {
          return upsert(trx, 'match_patch', {
            match_id: match.match_id,
            patch: constants.patch[utility.getPatchIndex(match.start_time)].name,
          }, {
            match_id: match.match_id,
          }, cb);
        }
        return cb();
      }

      function upsertTeamMatch(cb) {
        const arr = [];
        if (match.radiant_team_id) {
          arr.push({
            team_id: match.radiant_team_id,
            match_id: match.match_id,
            radiant: true,
          });
        }
        if (match.dire_team_id) {
          arr.push({
            team_id: match.dire_team_id,
            match_id: match.match_id,
            radiant: false,
          });
        }
        async.each(arr, (tm, cb) => {
          upsert(trx, 'team_match', tm, {
            team_id: tm.team_id,
            match_id: tm.match_id,
          }, cb);
        }, cb);
      }

      function upsertTeamRankings(cb) {
        return updateTeamRankings(match, options).then(cb).catch(cb);
      }

      function upsertMatchLogs(cb) {
        if (!match.logs) {
          return cb();
        }
        return trx.raw('DELETE FROM match_logs WHERE match_id = ?', [match.match_id])
          .asCallback((err) => {
            if (err) {
              return cb(err);
            }
            return async.eachLimit(match.logs, 10, (e, cb) => {
              cleanRowPostgres(db, 'match_logs', e, (err, cleanedRow) => {
                if (err) {
                  return cb(err);
                }
                return trx('match_logs').insert(cleanedRow).asCallback(cb);
              });
            }, cb);
          });
      }

      function exit(err) {
        if (err) {
          console.error(err);
          trx.rollback(err);
        } else {
          trx.commit();
        }
        cb(err);
      }

      async.series({
        upsertMatch,
        upsertPlayerMatches,
        upsertPicksBans,
        upsertMatchPatch,
        upsertTeamMatch,
        upsertTeamRankings,
        upsertMatchLogs,
      }, exit);
    });
  }

  function upsertMatchCassandra(cb) {
    // console.log('[INSERTMATCH] upserting into Cassandra');
    return cleanRowCassandra(cassandra, 'matches', match, (err, match) => {
      if (err) {
        return cb(err);
      }
      const obj = serialize(match);
      if (!Object.keys(obj).length) {
        return cb(err);
      }
      const query = util.format(
        'INSERT INTO matches (%s) VALUES (%s)',
        Object.keys(obj).join(','),
        Object.keys(obj).map(() => '?').join(','),
      );
      const arr = Object.keys(obj).map(k => ((obj[k] === 'true' || obj[k] === 'false') ? JSON.parse(obj[k]) : obj[k]));
      return cassandra.execute(query, arr, {
        prepare: true,
      }, (err) => {
        if (err) {
          return cb(err);
        }
        return async.each(players || [], (pm, cb) => {
          pm.match_id = match.match_id;
          cleanRowCassandra(cassandra, 'player_matches', pm, (err, pm) => {
            if (err) {
              return cb(err);
            }
            const obj2 = serialize(pm);
            if (!Object.keys(obj2).length) {
              return cb(err);
            }
            const query2 = util.format(
              'INSERT INTO player_matches (%s) VALUES (%s)',
              Object.keys(obj2).join(','),
              Object.keys(obj2).map(() => '?').join(','),
            );
            const arr2 = Object.keys(obj2).map(k => ((obj2[k] === 'true' || obj2[k] === 'false') ? JSON.parse(obj2[k]) : obj2[k]));
            return cassandra.execute(query2, arr2, {
              prepare: true,
            }, cb);
          });
        }, cb);
      });
    });
  }

  function updatePlayerCaches(cb) {
    // console.log('[INSERTMATCH] upserting into Cassandra player_caches');
    const copy = createMatchCopy(match, players);
    return insertPlayerCache(copy, cb);
  }

  function telemetry(cb) {
    // console.log('[INSERTMATCH] updating telemetry');
    const types = {
      api: 'matches_last_added',
      parsed: 'matches_last_parsed',
    };
    if (types[options.type]) {
      redis.lpush(types[options.type], JSON.stringify({
        match_id: match.match_id,
        duration: match.duration,
        start_time: match.start_time,
      }));
      redis.ltrim(types[options.type], 0, 9);
    }
    if (options.type === 'parsed') {
      redisCount(redis, 'parser');
    }
    if (options.origin === 'scanner') {
      redisCount(redis, 'added_match');
    }
    return cb();
  }

  function clearMatchCache(cb) {
    redis.del(`match:${match.match_id}`, cb);
  }

  function clearPlayerCaches(cb) {
    async.each((match.players || []).filter(player => Boolean(player.account_id)), (player, cb) => {
      async.each(cacheFunctions.getKeys(), (key, cb) => {
        cacheFunctions.update({ key, account_id: player.account_id }, cb);
      }, cb);
    }, cb);
  }

  function decideCounts(cb) {
    if (options.skipCounts) {
      return cb();
    }
    if (options.origin === 'scanner') {
      return redis.lpush('countsQueue', JSON.stringify(match), cb);
    }
    return cb();
  }

  function decideScenarios(cb) {
    if (options.doScenarios) {
      return redis.lpush('scenariosQueue', match.match_id, cb);
    }
    return cb();
  }

  function decideParsedBenchmarks(cb) {
    if (options.doParsedBenchmarks) {
      return redis.lpush('parsedBenchmarksQueue', match.match_id, cb);
    }
    return cb();
  }

  function decideMmr(cb) {
    async.each(match.players, (p, cb) => {
      if (options.origin === 'scanner'
        && match.lobby_type === 7
        && p.account_id
        && p.account_id !== utility.getAnonymousAccountId()
        && config.ENABLE_RANDOM_MMR_UPDATE) {
        redis.lpush('mmrQueue', JSON.stringify({
          match_id: match.match_id,
          account_id: p.account_id,
        }), cb);
      } else {
        cb();
      }
    }, cb);
  }

  function decideProfile(cb) {
    async.each(match.players, (p, cb) => {
      if ((match.match_id % 100) < Number(config.SCANNER_PLAYER_PERCENT)
        && options.origin === 'scanner'
        && p.account_id
        && p.account_id !== utility.getAnonymousAccountId()) {
        upsert(db, 'players', { account_id: p.account_id }, { account_id: p.account_id }, cb);
      } else {
        cb();
      }
    }, cb);
  }

  function decideGcData(cb) {
    // Don't get replay URLs for event matches
    if (options.origin === 'scanner' && match.game_mode !== 19 && (match.match_id % 100) < Number(config.GCDATA_PERCENT)) {
      redis.rpush('gcQueue', JSON.stringify({
        match_id: match.match_id,
      }), cb);
    } else {
      cb();
    }
  }

  function decideMetaParse(cb) {
    // metaQueue.add()
    cb();
  }

  function decideReplayParse(cb) {
    // (!utility.isSignificant(match) && !options.forceParse)
    if (options.skipParse || (match.game_mode === 19 && !options.forceParse)) {
      // skipped or event games
      // not parsing this match
      return cb();
    }
    // determine if any player in the match is tracked
    return async.some(match.players, (p, cb) => {
      redis.zscore('tracked', String(p.account_id), (err, score) => cb(err, Boolean(score)));
    }, (err, hasTrackedPlayer) => {
      if (err) {
        return cb(err);
      }
      const { doLogParse } = options;
      const doParse = hasTrackedPlayer || options.forceParse || doLogParse;
      if (doParse) {
        return queue.addJob('parse', {
          data: {
            match_id: match.match_id,
            radiant_win: match.radiant_win,
            start_time: match.start_time,
            duration: match.duration,
            replay_blob_key: match.replay_blob_key,
            pgroup: match.pgroup,
            doLogParse,
            ability_upgrades: abilityUpgrades,
            allowBackup: options.allowBackup,
            origin: options.origin,
          },
        }, {
          priority: options.priority,
          attempts: options.attempts || 15,
        }, cb);
      }
      return cb();
    });
  }
  async.series({
    preprocess,
    tellFeed,
    decideLogParse,
    updateMatchGcData,
    upsertMatch,
    upsertMatchCassandra,
    updatePlayerCaches,
    clearMatchCache,
    clearPlayerCaches,
    telemetry,
    decideCounts,
    decideScenarios,
    decideParsedBenchmarks,
    decideMmr,
    decideProfile,
    decideGcData,
    decideMetaParse,
    decideReplayParse,
  }, (err, results) => {
    cb(err, results.decideReplayParse);
  });
}

function getItemTimings(req, cb) {
  const heroId = req.query.hero_id || 0;
  const item = req.query.item || '';
  db.raw(
    `SELECT hero_id, item, time, sum(games) games, sum(wins) wins
     FROM scenarios
     WHERE item IS NOT NULL
     AND (0 = :heroId OR hero_id = :heroId)
     AND ('' = :item OR item = :item)
     GROUP BY hero_id, item, time ORDER BY time, hero_id, item
     LIMIT 1600`,
    { heroId, item },
  ).asCallback((err, result) => cb(err, result));
}

function getLaneRoles(req, cb) {
  const heroId = req.query.hero_id || 0;
  const lane = req.query.lane_role || 0;
  db.raw(
    `SELECT hero_id, lane_role, time, sum(games) games, sum(wins) wins
     FROM scenarios
     WHERE lane_role IS NOT NULL
     AND (0 = :heroId OR hero_id = :heroId)
     AND (0 = :lane OR lane_role = :lane)
     GROUP BY hero_id, lane_role, time ORDER BY hero_id, time, lane_role
     LIMIT 1200`,
    { heroId, lane },
  ).asCallback((err, result) => cb(err, result));
}

function getTeamScenarios(req, cb) {
  const scenario = (su.teamScenariosQueryParams.includes(req.query.scenario) && req.query.scenario) || '';
  db.raw(
    `SELECT scenario, is_radiant, region, sum(games) games, sum(wins) wins
     FROM team_scenarios
     WHERE ('' = :scenario OR scenario = :scenario)
     GROUP BY scenario, is_radiant, region ORDER BY scenario
     LIMIT 1000`,
    { scenario },
  ).asCallback((err, result) => cb(err, result));
}

function getMetadata(req, callback) {
  async.parallel({
    scenarios(cb) {
      cb(null, su.metadata);
    },
    banner(cb) {
      redis.get('banner', cb);
    },
    cheese(cb) {
      redis.get('cheese_goal', (err, result) => cb(err, {
        cheese: result,
        goal: config.GOAL,
      }));
    },
    user(cb) {
      cb(null, req.user);
    },
  }, callback);
}

module.exports = {
  upsert,
  insertPlayer,
  bulkIndexPlayer,
  insertMatch,
  insertPlayerRating,
  insertMatchSkillCassandra,
  getDistributions,
  getProPlayers,
  getHeroRankings,
  getHeroBenchmarks,
  getMatchBenchmarks,
  getMatchBenchmarksPromisified,
  getMatchRating,
  getLeaderboard,
  getPlayerMatches,
  getPlayerRatings,
  getPlayerHeroRankings,
  getPlayer,
  getMmrEstimate,
  getPeers,
  getProPeers,
  getWebhooks,
  getAPIKeys,
  getItemTimings,
  getLaneRoles,
  getTeamScenarios,
  getMetadata,
  getMatchRankTier,
};
