/**
 * Interface to ElasticSearch client
 * */
import { Client } from '@elastic/elasticsearch';
import config from '../config.js';

console.log('connecting %s', config.ELASTICSEARCH_URL);
const es = new Client({
  node: `http://${config.ELASTICSEARCH_URL}`,
  apiVersion: '6.8',
});

const INDEX = config.NODE_ENV === 'test' ? 'dota-test' : 'dota';

export default {
  es,
  INDEX,
};
