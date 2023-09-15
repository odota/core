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

module.exports = {
  explorer,
  getSchema,
  getMmrDistributions,
  getBuildStatus,
};
