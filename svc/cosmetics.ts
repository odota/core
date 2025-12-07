// Updates game cosmetic items in the database
import vdfparser from 'vdf-parser';
import db, { upsert } from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import axios from 'axios';

runInLoop(
  async function cosmetics() {
    const itemsResp = await axios.get(
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/items_game.txt',
      { responseType: 'text' },
    );
    const items = itemsResp.data;
    const iconsResp = await axios.get(
      'https://raw.githubusercontent.com/builder-247/node-dota2-cdn/main/build/icons.json',
    );
    const icons = iconsResp.data;
    const itemData = vdfparser.parse<any>(items);

    const ids = Object.keys(itemData.items_game.items);
    console.log('%s cosmetics to process', ids.length);
    for (let itemId of ids) {
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
  },
  3 * 60 * 60 * 1000,
);
