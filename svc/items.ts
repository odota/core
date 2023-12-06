// NOT WORKING: Updates game items in the database
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import { generateJob, getDataPromise } from '../util/utility';

async function start() {
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
}
start();
