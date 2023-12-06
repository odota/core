// NOT WORKING: Updates game items in the database
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mts';
import { generateJob, getDataPromise } from '../util/utility.mts';

while (true) {
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
  await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
}
