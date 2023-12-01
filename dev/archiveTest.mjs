import { archivePut, archiveGet } from "../store/archive.js";
import { getMatchData, getPlayerMatchData } from "../store/queries.js";

// Read some match data
const match = await getMatchData(7465883253);
const players = await getPlayerMatchData(7465883253);
const blob = Buffer.from(JSON.stringify({...match, players }));

// Archive it
await archivePut(match.match_id.toString(), blob);

// Read it back
const readBack = await archiveGet(match.match_id.toString());

console.log(blob.length, readBack.length);

// Confirm API returns the same data whether we used the archive or not

