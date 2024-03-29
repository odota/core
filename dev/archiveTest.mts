const { Archive } = await import('../store/archive.js');
const { tryReadArchivedMatch } = await import('../store/getArchivedData.js');

// Read some match data
// const match = await getMatchDataFromBlob(7465883253);
// const blob = Buffer.from(JSON.stringify(match));

const archive = new Archive('match');
// Archive it
// const putRes = await archive.archivePut(match.match_id?.toString() ?? '', blob);
// console.log(putRes);

// Read it back
// const readBack = await tryReadArchivedMatch(match.match_id!);

// console.log(JSON.stringify(match).length, JSON.stringify(readBack).length);

// Verify we get back null for invalid match id
const nullMatch = await tryReadArchivedMatch(123);
console.log(nullMatch);

// Confirm API returns the same data whether we used the archive or not
