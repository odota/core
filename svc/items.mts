// NOT WORKING: Updates game items in the database
import db from '../store/db.mts';
import utility from '../util/utility.mjs';
import { upsertPromise } from '../store/queries.mjs';

while (true) {
  // Need to find a replacement for this endpoint or just use dotaconstants
  const container = utility.generateJob('api_items', {
    language: 'english',
  });
  //@ts-ignore
  const body = await utility.getDataPromise(container.url);
  if (!body || !body.result || !body.result.items) {
    throw new Error('invalid body');
  }
  await Promise.all(
    body.result.items.map((item: any) =>
      //@ts-ignore
      upsertPromise(db, 'items', item, {
        id: item.id,
      })
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
}
