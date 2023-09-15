const { Client } = require("pg");
const config = require("../../config");

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

module.exports = {
  explorer,
};
