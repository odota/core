process.env.ENABLE_PLAYER_ARCHIVE = '1';
import queries from '../store/queries.js';
const { doArchivePlayerMatches, getArchivedPlayerMatches, getPlayerMatchesPromise } = queries;

// Write player blob to archive
await doArchivePlayerMatches('88367253');

// Read it back
// await getArchivedPlayerMatches('88367253');

// Check the combined getPlayerMatches results
await getPlayerMatchesPromise('88367253', { project: [], projectAll: true });

// There shouldn't be any duplicate match IDs
// The data should be the same