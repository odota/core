// Issues reparse requests for all matches in postgres that aren't parsed
import { addReliableJob } from '../svc/store/queue.ts';
import fs from 'node:fs';

const matches = JSON.parse(fs.readFileSync('./matchIds.json').toString());
for (let i = 0; i < matches.length; i++) {
  const input: number = matches[i];
  // match id request, get data from API
  await addReliableJob(
    { name: 'parse', data: { match_id: input } },
    { priority: 0 },
  );
}
