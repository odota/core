const async = require('async');
const db = require('../store/db');
const utility = require('../util/utility');
const queries = require('../store/queries');

const { invokeInterval } = utility;

function doItems(cb) {
  const container = utility.generateJob('api_items', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.items) {
      return cb();
    }
    return async.eachSeries(body.result.items, (item, cb) => {
      queries.upsert(db, 'items', item, {
        id: item.id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doItems, 60 * 60 * 1000);
