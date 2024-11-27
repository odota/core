import fs from 'fs';
import { processPlayerMatches } from '../util/archiveUtil.js';
const { getPlayerMatchesWithMetadata } = await import('../store/queries.js');

// Write player blob to archive
await processPlayerMatches(88367253);

// Read it back
// await getArchivedPlayerMatches('88367253');

// Check the combined getPlayerMatches results
const readBack = await getPlayerMatchesWithMetadata(88367253, {
  project: [],
  projectAll: true,
});
console.log(readBack[1]);

// There shouldn't be any duplicate match IDs
// The data should be the same
fs.writeFileSync('./build/88367253,json', JSON.stringify(readBack[0], null, 2));
