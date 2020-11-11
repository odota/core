/**
 * Interface to ElasticSearch client
 * */
const elasticsearch = require('elasticsearch');
const config = require('../config');


console.log('connecting %s', config.ELASTICSEARCH_URL);
const es = new elasticsearch.Client({
  host: config.ELASTICSEARCH_URL,
  apiVersion: 6.7,
  log: config.NODE_ENV === 'development' ? 'trace' : {
    type: 'file',
    level: 'trace',
    path: '/var/log/elasticsearch.log',
  },
});

const INDEX = config.NODE_ENV === 'test' ? 'dota-test' : 'dota';

module.exports = {
  es,
  INDEX,
};
