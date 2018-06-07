/**
 * Interface to PostgreSQL client
 * */
const config = require('../config');
const elasticsearch = require('elasticsearch');

console.log('connecting %s', config.ELASTICSEARCH_URL);
const es = new elasticsearch.Client({
  host: config.ELASTICSEARCH_URL,
  log: 'trace'
});

module.exports = es;
