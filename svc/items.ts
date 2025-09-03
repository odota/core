// Updates game items in the database
import { items } from 'dotaconstants';
import db from './store/db.ts';
import { upsert } from './util/insert.ts';
import {
  SteamAPIUrls,
  getSteamAPIData,
  invokeIntervalAsync,
} from './util/utility.ts';

async function doItems() {
  const url = SteamAPIUrls.api_items({
    language: 'english',
  });
  const body = await getSteamAPIData({ url });
  if (!body || !body.result || !body.result.data) {
    throw new Error('invalid body');
  }
  await Promise.all(
    body.result.data.itemabilities.map((item: any) => {
      item.localized_name = item.name_english_loc;
      item.cost =
        items?.[item.name.replace(/^item_/, '') as keyof typeof items]?.cost ||
        0;
      item.recipe = item.name.includes('recipe') ? 1 : 0;
      // NOTE: properties secret_shop and side_shop are no longer present
      upsert(db, 'items', item, {
        id: item.id,
      });
    }),
  );
}

invokeIntervalAsync(doItems, 60 * 60 * 1000);
