import db from './store/db.ts';
import { runInLoop, randomInt } from './util/utility.ts';
import { addReliableJob } from './store/queue.ts';

runInLoop(async function autoReconcile() {
  // We don't have a full listing of valid match IDs
  // Randomly guess IDs (about 1/2 will be valid) and try to parse them
  // This will get gcdata and reconcile
  const max =
    (await db.raw('select max(match_id) from public_matches'))?.rows?.[0]
      ?.max ?? 0;
  const rand = randomInt(0, max);
  await addReliableJob(
    {
      name: 'parse',
      data: { match_id: rand },
    },
    {
      attempts: 1,
      priority: 9,
    },
  );
}, 10000);
