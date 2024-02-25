// Updates game items in the database
import db from '../store/db';
import { upsert } from '../store/insert';
import {
  generateJob,
  getSteamAPIData,
  invokeIntervalAsync,
} from '../util/utility';

async function doItems() {
  const container = generateJob('api_items', {
    language: 'english',
  });
  const body = await getSteamAPIData(container.url);
  if (!body || !body.result || !body.result.data) {
    throw new Error('invalid body');
  }
  await Promise.all(
    body.result.data.itemabilities.map((item: any) => {
      item.localized_name = item.name_english_loc;
      // NOTE: properties cost, secret_shop, side_shop and recipe are no longer present
      upsert(db, 'items', item, {
        id: item.id,
      });
    }),
  );
}

invokeIntervalAsync(doItems, 60 * 60 * 1000);
