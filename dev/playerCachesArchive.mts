import fs from 'fs';
const { getPlayerMatchesPromiseWithMetadata } = await import('../store/queries.js');
const { doArchivePlayerMatches } = await import('../store/getArchivedData.js');

// Write player blob to archive
await doArchivePlayerMatches('88367253');

// Read it back
// await getArchivedPlayerMatches('88367253');

// Check the combined getPlayerMatches results
const readBack = await getPlayerMatchesPromiseWithMetadata('88367253', {
  project: [],
  projectAll: true,
});
console.log(readBack[1]);

// There shouldn't be any duplicate match IDs
// The data should be the same
fs.writeFileSync('./build/88367253,json', JSON.stringify(readBack[0], null, 2));
