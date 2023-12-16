// Updates game cosmetic items in the database
import vdf from 'simple-vdf';
import db from '../store/db';
import { upsert } from '../store/queries';
import {
  cleanItemSchema,
  eachLimitPromise,
  getDataPromise,
  invokeIntervalAsync,
} from '../util/utility';

async function doCosmetics() {
  const items = await getDataPromise({
    url: 'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/items_game.txt',
    raw: true,
  });
  const icons = await getDataPromise(
    'https://raw.githubusercontent.com/builder-247/node-dota2-cdn/main/build/icons.json'
  );
  const itemData = vdf.parse(cleanItemSchema(items));

  async function processItem(itemId: string) {
    const item = itemData.items_game.items[itemId];
    item.item_id = Number(itemId);
    const hero =
      item.used_by_heroes &&
      typeof item.used_by_heroes === 'object' &&
      Object.keys(item.used_by_heroes)[0];
    if (hero) {
      item.used_by_heroes = hero;
    }
    if (!item.item_id) {
      return;
    }
    if (item.image_inventory) {
      const spl = item.image_inventory.split('/');
      const iconname = spl[spl.length - 1];
      if (icons[iconname]) {
        item.image_path = icons[iconname];
      }
    }
    await upsert(db, 'cosmetics', item, {
      item_id: item.item_id,
    });
  }

  const promiseFuncs = Object.keys(itemData.items_game.items).map(
    (i) => () => processItem(i)
  );
  await eachLimitPromise(promiseFuncs, 10);
}
invokeIntervalAsync(doCosmetics, 12 * 60 * 60 * 1000);
