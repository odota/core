/**
 * Interface to ElasticSearch client
 * */
const elasticsearch = require('@elastic/elasticsearch');
const config = require('../config');


console.log('connecting %s', config.ELASTICSEARCH_URL);
const es = new elasticsearch.Client({
  node: `http://${config.ELASTICSEARCH_URL}`,
  apiVersion: '6.8',
});

const INDEX = config.NODE_ENV === 'test' ? 'dota-test' : 'dota';

module.exports = {
  es,
  INDEX,
};
