const { Client } = require("pg");
const buildStatus = require("../../store/buildStatus");
const config = require("../../config");
const db = require("../../store/db");
const queries = require("../../store/queries");
const redis = require("../../store/redis");

async function explorer(req, res) {
  // TODO handle NQL (@nicholashh query language)
  const input = req.query.sql;
  const client = new Client({
    connectionString: config.READONLY_POSTGRES_URL,
    statement_timeout: 10000,
  });
  client.connect();
  let result = null;
  let err = null;
  try {
    result = await client.query(input);
  } catch (e) {
    err = e;
  }
  client.end();
  const final = { ...result, err: err && err.toString() };
  return res.status(err ? 400 : 200).json(final);
}

function getSchema(req, res, cb) {
  db.select(["table_name", "column_name", "data_type"])
    .from("information_schema.columns")
    .where({
      table_schema: "public",
    })
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
}

function getMmrDistributions(req, res, cb) {
  queries.getDistributions(redis, (err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result);
  });
}

function getBuildStatus(req, res, cb) {
  buildStatus(db, redis, (err, status) => {
    if (err) {
      return cb(err);
    }
    return res.json(status);
  });
}

function getReplayData(req, res, cb) {
  db.select(["match_id", "cluster", "replay_salt"])
    .from("match_gcdata")
    .whereIn("match_id", [].concat(req.query.match_id || []).slice(0, 5))
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
}

function getRecordsByField(req, res, cb) {
  redis.zrevrange(`records:${req.params.field}`, 0, 99, "WITHSCORES", (err, rows) => {
    if (err) {
      return cb(err);
    }
    const entries = rows
      .map((r, i) => {
        const matchId = parseInt(r.split(":")[0], 10);
        const startTime = parseInt(r.split(":")[1], 10);
        const heroId = parseInt(r.split(":")[2], 10);
        const score = parseInt(rows[i + 1], 10);

        return {
          match_id: Number.isNaN(matchId) ? null : matchId,
          start_time: Number.isNaN(startTime) ? null : startTime,
          hero_id: Number.isNaN(heroId) ? null : heroId,
          score: Number.isNaN(score) ? null : score,
        };
      })
      .filter((r, i) => i % 2 === 0);
    return res.json(entries);
  });
}

module.exports = {
  explorer,
  getSchema,
  getMmrDistributions,
  getBuildStatus,
  getReplayData,
  getRecordsByField,
};
