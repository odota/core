const vdf = require('simple-vdf');
const async = require('async');
const db = require('../store/db');
const utility = require('../util/utility');
const invokeInterval = utility.invokeInterval;
const queries = require('../store/queries');

function doCosmetics(cb) {
  utility.getData(
    {
      url: 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/items/items_game.txt',
      raw: true,
    },
    (err, body) => {
      if (err) {
        return cb(err);
      }
      const itemData = vdf.parse(body);
      console.log(Object.keys(itemData.items_game.items).length);
      return async.eachLimit(Object.keys(itemData.items_game.items), 5, (itemId, cb) => {
        const item = itemData.items_game.items[itemId];
        item.item_id = Number(itemId);
        const hero = item.used_by_heroes && typeof (item.used_by_heroes) === 'object' && Object.keys(item.used_by_heroes)[0];

        function insert(cb) {
        // console.log(item);
          return queries.upsert(db, 'cosmetics', item, {
            item_id: item.item_id,
          }, cb);
        }
        if (hero) {
          item.used_by_heroes = hero;
        }
        // console.log(item);
        if (!item.item_id) {
          return cb();
        }
        if (item.image_inventory) {
          const spl = item.image_inventory.split('/');
          const iconname = spl[spl.length - 1];
          return utility.getData({
            url: utility.generateJob('api_item_icon', {
              iconname,
            }).url,
            noRetry: true,
          }, (err, body) => {
            if (err || !body || !body.result) {
              return cb();
            }
            item.image_path = body.result.path;
            return insert(cb);
          });
        }
        return insert(cb);
      }, cb);
    }
  );
}
invokeInterval(doCosmetics, 12 * 60 * 60 * 1000);
