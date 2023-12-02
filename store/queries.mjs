import async from 'async';
import constants from 'dotaconstants';
import util from 'util';
import utility from '../util/utility.mjs';
import config from '../config.js';
import queue from './queue.mjs';
import su from '../util/scenariosUtil.mjs';
import filter from '../util/filter.mjs';
import compute from '../util/compute.mjs';
import db from './db.mjs';
import redis from './redis.mjs';
import { es, INDEX } from './elasticsearch.mjs';
import cassandra from './cassandra.mjs';
import cacheFunctions from './cacheFunctions.mjs';
import { benchmarks } from '../util/benchmarksUtil.mjs';
import { archiveGet } from './archive.mjs';
const {
  redisCount,
  convert64to32,
  serialize,
  deserialize,
  isRadiant,
  isContributor,
  countItemPopularity,
  averageMedal,
} = utility;
const { computeMatchData } = compute;
const columnInfo = {};
const cassandraColumnInfo = {};
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
  return db(table)
    .columnInfo()
    .asCallback((err, result) => {
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
    'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
    [config.NODE_ENV === 'test' ? 'yasp_test' : 'yasp', table],
    (err, result) => {
      if (err) {
        return cb(err);
      }
      cassandraColumnInfo[table] = {};
      result.rows.forEach((r) => {
        cassandraColumnInfo[table][r.column_name] = 1;
      });
      return doCleanRow(err, cassandraColumnInfo[table], row, cb);
    }
  );
}
function getAPIKeys(db, cb) {
  db.raw(
    `
    SELECT api_key FROM api_keys WHERE api_key IS NOT NULL AND is_canceled IS NOT TRUE
    `
  ).asCallback((err, result) => {
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
  async.map(
    m.players,
    (p, cb) => {
      p.benchmarks = {};
      async.eachSeries(
        Object.keys(benchmarks),
        (metric, cb) => {
          // Use data from previous epoch
          let key = [
            'benchmarks',
            utility.getStartOfBlockMinutes(
              config.BENCHMARK_RETENTION_MINUTES,
              -1
            ),
            metric,
            p.hero_id,
          ].join(':');
          const backupKey = [
            'benchmarks',
            utility.getStartOfBlockMinutes(
              config.BENCHMARK_RETENTION_MINUTES,
              0
            ),
            metric,
            p.hero_id,
          ].join(':');
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
              if (
                raw !== undefined &&
                raw !== null &&
                !Number.isNaN(Number(raw))
              ) {
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
        },
        cb
      );
    },
    cb
  );
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
  const keys = [
    'distribution:ranks',
    'distribution:mmr',
    'distribution:country_mmr',
  ];
  const result = {};
  async.each(
    keys,
    (r, cb) => {
      redis.get(r, (err, blob) => {
        if (err) {
          return cb(err);
        }
        result[r.split(':')[1]] = JSON.parse(blob);
        return cb(err);
      });
    },
    (err) => cb(err, result)
  );
}
function getProPlayers(db, redis, cb) {
  db.raw(
    `
    SELECT * from notable_players
    `
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}
function getLeaderboard(db, redis, key, n, cb) {
  redis.zrevrangebyscore(
    key,
    'inf',
    '-inf',
    'WITHSCORES',
    'LIMIT',
    '0',
    n,
    (err, rows) => {
      if (err) {
        return cb(err);
      }
      const entries = rows
        .map((r, i) => ({
          account_id: r,
          score: rows[i + 1],
        }))
        .filter((r, i) => i % 2 === 0);
      const accountIds = entries.map((r) => r.account_id);
      // get player data from DB
      return db
        .select()
        .from('players')
        .whereIn('account_id', accountIds)
        .asCallback((err, names) => {
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
    }
  );
}
function getHeroRankings(db, redis, heroId, options, cb) {
  db.raw(
    `
  SELECT players.account_id, score, personaname, name, avatar, last_login, rating as rank_tier
  from hero_ranking
  join players using(account_id)
  left join notable_players using(account_id)
  left join rank_tier using(account_id)
  WHERE hero_id = ?
  ORDER BY score DESC
  LIMIT 100
  `,
    [heroId || 0]
  ).asCallback((err, result) => {
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
function getHeroItemPopularity(db, redis, heroId, options, cb) {
  db.raw(
    `
  SELECT purchase_log
  FROM player_matches
  JOIN matches USING(match_id)
  WHERE hero_id = ? AND version IS NOT NULL
  ORDER BY match_id DESC
  LIMIT 100
  `,
    [heroId || 0]
  ).asCallback((err, purchaseLogs) => {
    if (err) {
      return cb(err);
    }
    const items = purchaseLogs.rows
      .flatMap((purchaseLog) => purchaseLog.purchase_log)
      .filter((item) => item && item.key && item.time != null)
      .map((item) => {
        const time = parseInt(item.time, 10);
        const { cost, id } = constants.items[item.key];
        return { cost, id, time };
      });
    const startGameItems = countItemPopularity(
      items.filter((item) => item.time <= 0 && item.cost <= 600)
    );
    const earlyGameItems = countItemPopularity(
      items.filter(
        (item) => item.time > 0 && item.time < 60 * 10 && item.cost >= 500
      )
    );
    const midGameItems = countItemPopularity(
      items.filter(
        (item) =>
          item.time >= 60 * 10 && item.time < 60 * 25 && item.cost >= 1000
      )
    );
    const lateGameItems = countItemPopularity(
      items.filter((item) => item.time >= 60 * 25 && item.cost >= 2000)
    );
    return cb(null, {
      start_game_items: startGameItems,
      early_game_items: earlyGameItems,
      mid_game_items: midGameItems,
      late_game_items: lateGameItems,
    });
  });
}
function getHeroBenchmarks(db, redis, options, cb) {
  const heroId = options.hero_id;
  const ret = {};
  async.each(
    Object.keys(benchmarks),
    (metric, cb) => {
      const arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
      async.each(
        arr,
        (percentile, cb) => {
          // Use data from previous epoch
          let key = [
            'benchmarks',
            utility.getStartOfBlockMinutes(
              config.BENCHMARK_RETENTION_MINUTES,
              -1
            ),
            metric,
            heroId,
          ].join(':');
          const backupKey = [
            'benchmarks',
            utility.getStartOfBlockMinutes(
              config.BENCHMARK_RETENTION_MINUTES,
              0
            ),
            metric,
            heroId,
          ].join(':');
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
              return redis.zrange(
                key,
                position,
                position,
                'WITHSCORES',
                (err, result) => {
                  const obj = {
                    percentile,
                    value: Number(result[1]),
                  };
                  if (!ret[metric]) {
                    ret[metric] = [];
                  }
                  ret[metric].push(obj);
                  cb(err, obj);
                }
              );
            });
          });
        },
        cb
      );
    },
    (err) =>
      cb(err, {
        hero_id: Number(heroId),
        result: ret,
      })
  );
}
function getMmrEstimate(accountId, cb) {
  db.first('estimate')
    .from('mmr_estimates')
    .where({ account_id: accountId })
    .asCallback(cb);
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
      queryObj.project
        .filter((f) => cassandraColumnInfo.player_caches[f])
        .join(',')
    );
    const matches = [];
    return cassandra.eachRow(
      query,
      [accountId],
      {
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
        const offset = matches.slice(queryObj.offset || 0);
        const result = offset.slice(0, queryObj.limit || offset.length);
        return cb(err, result);
      }
    );
  });
}
function getPlayerRatings(db, accountId, cb) {
  if (!Number.isNaN(Number(accountId))) {
    db.from('player_ratings')
      .where({
        account_id: Number(accountId),
      })
      .orderBy('time', 'asc')
      .asCallback((err, result) => {
        cb(err, result);
      });
  } else {
    cb();
  }
}
function getPlayerHeroRankings(accountId, cb) {
  db.raw(
    `
  SELECT
  hero_id,
  playerscore.score,
  count(1) filter (where hr.score <= playerscore.score)::float/count(1) as percent_rank,
  count(1) * 4000 card
  FROM (select * from hero_ranking TABLESAMPLE SYSTEM(0.025)) hr
  JOIN (select hero_id, score from hero_ranking hr2 WHERE account_id = ?) playerscore using (hero_id)
  GROUP BY hero_id, playerscore.score
  ORDER BY percent_rank desc
  `,
    [accountId]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}
function getPlayer(db, accountId, cb) {
  if (!Number.isNaN(Number(accountId))) {
    db.first(
      'players.account_id',
      'personaname',
      'name',
      'plus',
      'cheese',
      'steamid',
      'avatar',
      'avatarmedium',
      'avatarfull',
      'profileurl',
      'last_login',
      'loccountrycode',
      'subscriber.status'
    )
      .from('players')
      .leftJoin(
        'notable_players',
        'players.account_id',
        'notable_players.account_id'
      )
      .leftJoin('subscriber', 'players.account_id', 'subscriber.account_id')
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
    if (
      numId &&
      numId !== Number(player.account_id) &&
      numId !== utility.getAnonymousAccountId() &&
      tm.games >= 5
    ) {
      teammatesArr.push(tm);
    }
  });
  teammatesArr.sort((a, b) => b.games - a.games);
  // limit to 200 max players
  teammatesArr = teammatesArr.slice(0, 200);
  return async.each(
    teammatesArr,
    (t, cb) => {
      db.first(
        'players.account_id',
        'personaname',
        'name',
        'avatar',
        'avatarfull',
        'last_login',
        'subscriber.status'
      )
        .from('players')
        .leftJoin(
          'notable_players',
          'players.account_id',
          'notable_players.account_id'
        )
        .leftJoin('subscriber', 'players.account_id', 'subscriber.account_id')
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
          t.is_subscriber = Boolean(row.status);
          t.last_login = row.last_login;
          t.avatar = row.avatar;
          t.avatarfull = row.avatarfull;
          return cb(err);
        });
    },
    (err) => {
      cb(err, teammatesArr);
    }
  );
}
function getProPeers(db, input, player, cb) {
  if (!input) {
    return cb();
  }
  const teammates = input;
  return db
    .raw(
      `select *, notable_players.account_id
          FROM notable_players
          LEFT JOIN players
          ON notable_players.account_id = players.account_id
          `
    )
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      const arr = result.rows
        .map((r) => ({ ...r, ...teammates[r.account_id] }))
        .filter((r) => r.account_id !== player.account_id && r.games)
        .sort((a, b) => b.games - a.games);
      return cb(err, arr);
    });
}
function getMatchRating(match, cb) {
  async.map(
    match.players,
    (player, cb) => {
      if (!player.account_id) {
        return cb();
      }
      return db
        .first()
        .from('solo_competitive_rank')
        .where({ account_id: player.account_id })
        .asCallback((err, row) => {
          cb(err, row ? row.rating : null);
        });
    },
    (err, result) => {
      if (err) {
        return cb(err);
      }
      // Remove undefined/null values
      const filt = result.filter((r) => r);
      const avg = Math.floor(
        filt.map((r) => Number(r)).reduce((a, b) => a + b, 0) / filt.length
      );
      return cb(err, avg, filt.length);
    }
  );
}
function getMatchRankTier(match, cb) {
  async.map(
    match.players,
    (player, cb) => {
      if (!player.account_id) {
        return cb();
      }
      return db
        .first()
        .from('rank_tier')
        .where({ account_id: player.account_id })
        .asCallback((err, row) => {
          cb(err, row ? row.rating : null);
        });
    },
    (err, result) => {
      if (err) {
        return cb(err);
      }
      // Remove undefined/null values
      const filt = result.filter((r) => r);
      const avg = averageMedal(filt.map((r) => Number(r))) || null;
      return cb(err, avg, filt.length);
    }
  );
}
function upsert(db, table, row, conflict, cb) {
  cleanRowPostgres(db, table, row, (err, row) => {
    if (err) {
      return cb(err);
    }
    const values = Object.keys(row).map(() => '?');
    const update = Object.keys(row).map((key) =>
      util.format('%s=%s', key, `EXCLUDED.${key}`)
    );
    const query = util.format(
      'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s',
      table,
      Object.keys(row).join(','),
      values.join(','),
      Object.keys(conflict).join(','),
      update.join(',')
    );
    return db
      .raw(
        query,
        Object.keys(row).map((key) => row[key])
      )
      .asCallback(cb);
  });
}
export const upsertPromise = util.promisify(upsert);
function insertPlayer(db, player, indexPlayer, cb) {
  if (player.steamid) {
    // this is a login, compute the account_id from steamid
    player.account_id = Number(convert64to32(player.steamid));
  }
  if (
    !player.account_id ||
    player.account_id === utility.getAnonymousAccountId()
  ) {
    return cb();
  }
  if (indexPlayer) {
    es.update(
      {
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
      },
      (err) => {
        if (err) {
          console.log(err);
        }
      }
    );
  }
  return upsert(
    db,
    'players',
    player,
    {
      account_id: player.account_id,
    },
    cb
  );
}
export const insertPlayerPromise = util.promisify(insertPlayer);
function bulkIndexPlayer(bulkActions, cb) {
  // Bulk call to ElasticSearch
  if (bulkActions.length > 0) {
    es.bulk(
      {
        body: bulkActions,
        index: INDEX,
        type: 'player',
      },
      cb
    );
  }
}
function insertPlayerRating(db, row, cb) {
  async.series(
    {
      pr(cb) {
        if (
          row.match_id &&
          (row.solo_competitive_rank || row.competitive_rank)
        ) {
          db('player_ratings')
            .insert({
              account_id: row.account_id,
              match_id: row.match_id,
              time: row.time,
              solo_competitive_rank: row.solo_competitive_rank,
              competitive_rank: row.competitive_rank,
            })
            .asCallback(cb);
        } else {
          cb();
        }
      },
      scr(cb) {
        if (row.solo_competitive_rank) {
          upsert(
            db,
            'solo_competitive_rank',
            {
              account_id: row.account_id,
              rating: row.solo_competitive_rank,
            },
            { account_id: row.account_id },
            cb
          );
        } else {
          cb();
        }
      },
      cr(cb) {
        if (row.competitive_rank) {
          upsert(
            db,
            'competitive_rank',
            {
              account_id: row.account_id,
              rating: row.competitive_rank,
            },
            { account_id: row.account_id },
            cb
          );
        } else {
          cb();
        }
      },
      rt(cb) {
        if (row.rank_tier) {
          upsert(
            db,
            'rank_tier',
            { account_id: row.account_id, rating: row.rank_tier },
            { account_id: row.account_id },
            cb
          );
        } else {
          cb();
        }
      },
      lr(cb) {
        if (row.leaderboard_rank) {
          upsert(
            db,
            'leaderboard_rank',
            {
              account_id: row.account_id,
              rating: row.leaderboard_rank,
            },
            { account_id: row.account_id },
            cb
          );
        } else {
          cb();
        }
      },
    },
    cb
  );
}
function writeCache(accountId, cache, cb) {
  return async.each(
    cache.raw,
    (match, cb) => {
      cleanRowCassandra(
        cassandra,
        'player_caches',
        match,
        (err, cleanedMatch) => {
          if (err) {
            return cb(err);
          }
          const serializedMatch = serialize(cleanedMatch);
          const query = util.format(
            'INSERT INTO player_caches (%s) VALUES (%s)',
            Object.keys(serializedMatch).join(','),
            Object.keys(serializedMatch)
              .map(() => '?')
              .join(',')
          );
          const arr = Object.keys(serializedMatch).map(
            (k) => serializedMatch[k]
          );
          return cassandra.execute(
            query,
            arr,
            {
              prepare: true,
            },
            cb
          );
        }
      );
    },
    cb
  );
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
  return async.eachSeries(
    players,
    (playerMatch, cb) => {
      if (
        playerMatch.account_id &&
        playerMatch.account_id !== utility.getAnonymousAccountId()
      ) {
        // join player with match to form player_match
        Object.keys(match).forEach((key) => {
          if (key !== 'players') {
            playerMatch[key] = match[key];
          }
        });
        computeMatchData(playerMatch);
        return writeCache(
          playerMatch.account_id,
          {
            raw: [playerMatch],
          },
          cb
        );
      }
      return cb();
    },
    cb
  );
}
async function updateTeamRankings(match, options) {
  if (
    options.origin === 'scanner' &&
    options.type === 'api' &&
    match.radiant_team_id &&
    match.dire_team_id &&
    match.radiant_win !== undefined
  ) {
    const team1 = match.radiant_team_id;
    const team2 = match.dire_team_id;
    const team1Win = Number(match.radiant_win);
    const kFactor = 32;
    const data1 = await db
      .select('rating')
      .from('team_rating')
      .where({ team_id: team1 });
    const data2 = await db
      .select('rating')
      .from('team_rating')
      .where({ team_id: team2 });
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
      team1,
      currRating1 + ratingDiff1,
      win1,
      Number(!win1),
      match.start_time,
      ratingDiff1,
      win1,
      Number(!win1),
      match.start_time,
    ]);
    await db.raw(query, [
      team2,
      currRating2 + ratingDiff2,
      win2,
      Number(!win2),
      match.start_time,
      ratingDiff2,
      win2,
      Number(!win2),
      match.start_time,
    ]);
  }
}
function createMatchCopy(match, players) {
  const copy = JSON.parse(JSON.stringify(match));
  copy.players = JSON.parse(JSON.stringify(players));
  return copy;
}
export const insertMatchPromise = util.promisify(insertMatch);
function insertMatch(match, options, cb) {
  const players = match.players
    ? JSON.parse(JSON.stringify(match.players))
    : undefined;
  const abilityUpgrades = [];
  const savedAbilityLvls = {
    5288: 'track',
    5368: 'greevils_greed',
  };
  // We currently can call this function from many places
  // There is a type to indicate source: api, gcdata, parsed
  // Also an origin to indicate the context: scanner (fresh match) or request
  function preprocess(cb) {
    // We always do this
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
          p.ability_upgrades_arr = p.ability_upgrades.map((au) => au.ability);
          const abilityLvls = {};
          p.ability_upgrades.forEach((au) => {
            if (au.ability in savedAbilityLvls) {
              abilityLvls[au.ability] = (abilityLvls[au.ability] || 0) + 1;
              const abilityUpgrade = { ...au, level: abilityLvls[au.ability] };
              abilityUpgrades.push(abilityUpgrade);
            }
          });
        }
      });
    }
    cb();
  }
  async function upsertMatchPostgres(cb) {
    // Insert the pro match data: We do this if api or parser
    if (options.type === 'api' && !utility.isProMatch(match)) {
      // Check whether we care about this match for pro purposes
      // We need the basic match data to run the check, so only do it if type is api
      return cb();
    }
    // Check if leagueid is premium/professional
    const result = match.leagueid
      ? await db.raw(
          `select leagueid from leagues where leagueid = ? and (tier = 'premium' OR tier = 'professional')`,
          [match.leagueid]
        )
      : null;
    const pass = result?.rows?.length > 0;
    if (!pass) {
      // Skip this if not a pro match
      return cb();
    }
    return db.transaction((trx) => {
      function upsertMatch(cb) {
        upsert(
          trx,
          'matches',
          match,
          {
            match_id: match.match_id,
          },
          cb
        );
      }
      function upsertPlayerMatches(cb) {
        async.each(
          players || [],
          (pm, cb) => {
            pm.match_id = match.match_id;
            // Add lane data
            if (pm.lane_pos) {
              const laneData = utility.getLaneFromPosData(
                pm.lane_pos,
                isRadiant(pm)
              );
              pm.lane = laneData.lane || null;
              pm.lane_role = laneData.lane_role || null;
              pm.is_roaming = laneData.is_roaming || null;
            }
            upsert(
              trx,
              'player_matches',
              pm,
              {
                match_id: pm.match_id,
                player_slot: pm.player_slot,
              },
              cb
            );
          },
          cb
        );
      }
      function upsertPicksBans(cb) {
        async.each(
          match.picks_bans || [],
          (p, cb) => {
            // order is a reserved keyword
            p.ord = p.order;
            p.match_id = match.match_id;
            upsert(
              trx,
              'picks_bans',
              p,
              {
                match_id: p.match_id,
                ord: p.ord,
              },
              cb
            );
          },
          cb
        );
      }
      function upsertMatchPatch(cb) {
        if (match.start_time) {
          return upsert(
            trx,
            'match_patch',
            {
              match_id: match.match_id,
              patch:
                constants.patch[utility.getPatchIndex(match.start_time)].name,
            },
            {
              match_id: match.match_id,
            },
            cb
          );
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
        async.each(
          arr,
          (tm, cb) => {
            upsert(
              trx,
              'team_match',
              tm,
              {
                team_id: tm.team_id,
                match_id: tm.match_id,
              },
              cb
            );
          },
          cb
        );
      }
      function upsertTeamRankings(cb) {
        return updateTeamRankings(match, options).then(cb).catch(cb);
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
      async.series(
        {
          upsertMatch,
          upsertPlayerMatches,
          upsertPicksBans,
          upsertMatchPatch,
          upsertTeamMatch,
          upsertTeamRankings,
        },
        exit
      );
    });
  }
  function getAverageRank(cb) {
    // Only fetch the average_rank if this is a fresh match since otherwise it won't be accurate
    // We currently only store this in the player_caches table, not in the match itself
    if (options.origin === 'scanner' && options.type === 'api') {
      getMatchRankTier(match, (err, avg) => {
        match.average_rank = avg || null;
        return cb();
      });
    } else {
      cb();
    }
  }
  function upsertMatchCassandra(cb) {
    // We do this regardless of type (with different sets of fields)
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
        Object.keys(obj)
          .map(() => '?')
          .join(',')
      );
      const arr = Object.keys(obj).map((k) =>
        obj[k] === 'true' || obj[k] === 'false' ? JSON.parse(obj[k]) : obj[k]
      );
      return cassandra.execute(
        query,
        arr,
        {
          prepare: true,
        },
        (err) => {
          if (err) {
            return cb(err);
          }
          return async.each(
            players || [],
            (pm, cb) => {
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
                  Object.keys(obj2)
                    .map(() => '?')
                    .join(',')
                );
                const arr2 = Object.keys(obj2).map((k) =>
                  obj2[k] === 'true' || obj2[k] === 'false'
                    ? JSON.parse(obj2[k])
                    : obj2[k]
                );
                return cassandra.execute(
                  query2,
                  arr2,
                  {
                    prepare: true,
                  },
                  cb
                );
              });
            },
            cb
          );
        }
      );
    });
  }
  function upsertMatchBlobs(cb) {
    // TODO this function is meant to eventually replace the cassandra match/player_match tables
    // NOTE: remove pgroup since we don't actually need it stored
    // It's a temporary store (postgres table) holding data for each possible stage of ingestion, api/gcdata/replay/meta etc.
    // We store a match blob in the row for each stage
    // in buildMatch we can assemble the data from all these pieces
    // After some retention period we stick the data in match archive and delete it
    cb();
  }
  function updateCassandraPlayerCaches(cb) {
    // Add the 10 player_match rows indexed by player
    // We currently do this on all types
    const copy = createMatchCopy(match, players);
    return insertPlayerCache(copy, cb);
  }
  function telemetry(cb) {
    const types = {
      api: 'matches_last_added',
      parsed: 'matches_last_parsed',
    };
    if (types[options.type]) {
      redis.lpush(
        types[options.type],
        JSON.stringify({
          match_id: match.match_id,
          // start_time + duration = end_time
          start_time: match.start_time,
          duration: match.duration,
        })
      );
      redis.ltrim(types[options.type], 0, 9);
    }
    if (options.type === 'parsed') {
      redisCount(redis, 'parser');
    }
    if (options.origin === 'scanner' && options.type === 'api') {
      redisCount(redis, 'added_match');
    }
    return cb();
  }
  function clearRedisMatch(cb) {
    // Clear out the Redis caches, we do this regardless of insert type
    redis.del(`match:${match.match_id}`, cb);
  }
  function clearRedisPlayer(cb) {
    async.each(
      (match.players || []).filter((player) => Boolean(player.account_id)),
      (player, cb) => {
        async.each(
          cacheFunctions.getKeys(),
          (key, cb) => {
            cacheFunctions.update({ key, account_id: player.account_id }, cb);
          },
          cb
        );
      },
      cb
    );
  }
  function decideCounts(cb) {
    // We only do this if fresh match
    if (options.skipCounts) {
      return cb();
    }
    if (options.origin === 'scanner' && options.type === 'api') {
      queue.addJob('countsQueue', JSON.stringify(match));
      return cb();
    }
    return cb();
  }
  function decideBenchmarks(cb) {
    // We only do this if fresh match
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      match.match_id % 100 < config.BENCHMARKS_SAMPLE_PERCENT
    ) {
      queue.addJob('parsedBenchmarksQueue', match.match_id);
      return cb();
    }
    return cb();
  }
  function decideMmr(cb) {
    // We only do this if fresh match and ranked
    async.each(
      match.players,
      (p, cb) => {
        if (
          options.origin === 'scanner' &&
          options.type === 'api' &&
          match.lobby_type === 7 &&
          p.account_id &&
          p.account_id !== utility.getAnonymousAccountId() &&
          config.ENABLE_RANDOM_MMR_UPDATE
        ) {
          queue.addJob(
            'mmrQueue',
            JSON.stringify({
              match_id: match.match_id,
              account_id: p.account_id,
            })
          );
          cb();
        } else {
          cb();
        }
      },
      cb
    );
  }
  async function decideProfile(cb) {
    // We only do this if fresh match
    if (
      match.match_id % 100 < Number(config.SCANNER_PLAYER_PERCENT) &&
      options.origin === 'scanner' &&
      options.type === 'api' &&
      match.players
    ) {
      try {
        const filteredPlayers = match.players.filter((p) => {
          return (
            p.account_id && p.account_id !== utility.getAnonymousAccountId()
          );
        });
        // Add a placeholder player with just the ID
        await Promise.all(
          filteredPlayers.map((p) =>
            upsertPromise(
              db,
              'players',
              { account_id: p.account_id },
              { account_id: p.account_id }
            )
          )
        );
        // We could also queue a profile job here but seems like a lot to update name after each match
        cb();
      } catch (e) {
        cb(e);
      }
    } else {
      cb();
    }
  }
  function decideGcData(cb) {
    // We only do this for fresh matches
    // Don't get replay URLs for event matches
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      match.game_mode !== 19 &&
      match.match_id % 100 < Number(config.GCDATA_PERCENT)
    ) {
      queue.addJob(
        'gcQueue',
        JSON.stringify({
          match_id: match.match_id,
          pgroup: match.pgroup,
        })
      );
      cb();
    } else {
      cb();
    }
  }
  function decideMetaParse(cb) {
    // metaQueue.add()
    cb();
  }
  function decideReplayParse(cb) {
    // We use params like skipParse and forceParse to determine whether we want to parse or not
    // Otherwise this assumes a fresh match and checks to see if pro or tracked player
    // Returns the created parse job (or null)
    if (options.skipParse || match.game_mode === 19) {
      // skipped or event games
      // not parsing this match
      return cb();
    }
    // determine if any player in the match is tracked
    return async.some(
      match.players,
      (p, cb) => {
        redis.zscore('tracked', String(p.account_id), (err, score) =>
          cb(err, Boolean(score))
        );
      },
      async (err, hasTrackedPlayer) => {
        if (err) {
          return cb(err);
        }
        const doParse = hasTrackedPlayer || options.forceParse;
        if (doParse) {
          let priority = options.priority;
          if (match.leagueid) {
            priority = -1;
          }
          if (hasTrackedPlayer) {
            priority = -2;
          }
          try {
            const job = await queue.addReliableJob(
              'parse',
              {
                data: {
                  match_id: match.match_id,
                  // leagueid to determine whether to upsert Postgres after parse
                  leagueid: match.leagueid,
                  // start_time and duration for logging
                  start_time: match.start_time,
                  duration: match.duration,
                  pgroup: match.pgroup,
                  origin: options.origin,
                },
              },
              {
                priority,
                attempts: options.attempts || 15,
              }
            );
            cb(null, job);
          } catch (e) {
            cb(e);
          }
        }
        return cb();
      }
    );
  }
  async.series(
    {
      preprocess,
      upsertMatchPostgres: (cb) => upsertMatchPostgres(cb),
      getAverageRank,
      upsertMatchCassandra,
      upsertMatchBlobs,
      updateCassandraPlayerCaches,
      clearRedisMatch,
      clearRedisPlayer,
      telemetry,
      decideCounts,
      decideBenchmarks,
      decideMmr,
      decideProfile: (cb) => decideProfile(cb),
      decideGcData,
      decideMetaParse,
      decideReplayParse,
    },
    (err, results) => {
      cb(err, results.decideReplayParse);
    }
  );
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
    { heroId, item }
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
    { heroId, lane }
  ).asCallback((err, result) => cb(err, result));
}
function getTeamScenarios(req, cb) {
  const scenario =
    (su.teamScenariosQueryParams.includes(req.query.scenario) &&
      req.query.scenario) ||
    '';
  db.raw(
    `SELECT scenario, is_radiant, region, sum(games) games, sum(wins) wins
     FROM team_scenarios
     WHERE ('' = :scenario OR scenario = :scenario)
     GROUP BY scenario, is_radiant, region ORDER BY scenario
     LIMIT 1000`,
    { scenario }
  ).asCallback((err, result) => cb(err, result));
}
function getMetadata(req, callback) {
  async.parallel(
    {
      scenarios(cb) {
        cb(null, su.metadata);
      },
      banner(cb) {
        redis.get('banner', cb);
      },
      user(cb) {
        cb(null, req.user);
      },
      isSubscriber(cb) {
        if (req.user) {
          db.raw(
            "SELECT account_id from subscriber WHERE account_id = ? AND status = 'active'",
            [req.user.account_id]
          ).asCallback((err, result) => {
            cb(err, Boolean(result?.rows?.[0]));
          });
        } else {
          cb(null, false);
        }
      },
    },
    callback
  );
}
export async function getMatchData(matchId) {
  const result = await cassandra.execute(
    'SELECT * FROM matches where match_id = ?',
    [Number(matchId)],
    {
      prepare: true,
      fetchSize: 1,
      autoPage: true,
    }
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  return deserializedResult[0];
}
export async function getPlayerMatchData(matchId) {
  const result = await cassandra.execute(
    'SELECT * FROM player_matches where match_id = ?',
    [Number(matchId)],
    {
      prepare: true,
      fetchSize: 24,
      autoPage: true,
    }
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  return deserializedResult;
}
export async function getArchivedMatch(matchId) {
  try {
    const result = JSON.parse(await archiveGet(matchId.toString()));
    if (result) {
      utility.redisCount(redis, 'match_archive_read');
      return result;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}
export default {
  upsert,
  upsertPromise,
  insertPlayer,
  insertPlayerPromise,
  bulkIndexPlayer,
  insertMatchPromise,
  insertPlayerRating,
  getDistributions,
  getProPlayers,
  getHeroRankings,
  getHeroItemPopularity,
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
  getAPIKeys,
  getItemTimings,
  getLaneRoles,
  getTeamScenarios,
  getMetadata,
  getMatchRankTier,
  getMatchData,
  getPlayerMatchData,
  getArchivedMatch,
};
