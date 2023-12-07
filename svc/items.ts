// NOT WORKING: Updates game items in the database
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import {
  generateJob,
  getDataPromise,
  invokeIntervalAsync,
} from '../util/utility';

async function doItems() {
  // Need to find a replacement for this endpoint or just use dotaconstants
  const container = generateJob('api_items', {
    language: 'english',
  });
  const body = await getDataPromise(container.url);
  if (!body || !body.result || !body.result.items) {
    throw new Error('invalid body');
  }
  await Promise.all(
    body.result.items.map((item: any) =>
      upsertPromise(db, 'items', item, {
        id: item.id,
      })
    )
  );
}
invokeIntervalAsync(doItems, 60 * 60 * 1000);
