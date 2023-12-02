import async from 'async';
import db from '../store/db.mjs';
import utility from '../util/utility.js';
import queries from '../store/queries.mjs';
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
    return async.eachSeries(
      body.result.items,
      (item, cb) => {
        queries.upsert(
          db,
          'items',
          item,
          {
            id: item.id,
          },
          cb
        );
      },
      cb
    );
  });
}
invokeInterval(doItems, 60 * 60 * 1000);
