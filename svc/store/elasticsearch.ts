import elasticsearch from '@elastic/elasticsearch';
import config from '../../config.ts';
console.log('connecting %s', config.ELASTICSEARCH_URL);
export const es = new elasticsearch.Client({
  node: `http://${config.ELASTICSEARCH_URL}`,
  //@ts-ignore
  apiVersion: '6.8',
});
export const INDEX = config.NODE_ENV === 'test' ? 'dota-test' : 'dota';
