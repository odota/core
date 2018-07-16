/**
 * Interface to ElasticSearch client
 * */
const config = require('../config');
const elasticsearch = require('elasticsearch');


console.log('connecting %s', config.ELASTICSEARCH_URL);
const es = new elasticsearch.Client({
  host: config.ELASTICSEARCH_URL,
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
