import fs from 'node:fs';

// Delete existing
fs.rmSync('./proto', { recursive: true, force: true });
fs.mkdirSync('./proto');

// Fetch protos from https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_match_metadata.proto
let resp = await fetch(
  'https://api.github.com/repos/SteamDatabase/GameTracking-Dota2/git/trees/master?recursive=1',
);
if (!resp.ok) {
  throw new Error('fetch not ok');
}
const json = await resp.json();
const files = json.tree;
for (let file of files) {
  if (file.path.startsWith('Protobufs/')) {
    console.log(file.path);
    const name = file.path.split('/').slice(-1)[0];
    resp = await fetch(
      'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/' +
        file.path,
    );
    if (!resp.ok) {
      throw new Error('fetch not ok');
    }
    fs.writeFileSync('./proto/' + name, Buffer.from(await resp.arrayBuffer()));
  }
}
// Get descriptor file
resp = await fetch(
  'https://github.com/protocolbuffers/protobuf/raw/refs/heads/main/src/google/protobuf/descriptor.proto',
);
if (!resp.ok) {
  throw new Error('fetch not ok');
}
fs.mkdirSync('./proto/google/protobuf', { recursive: true });
fs.writeFileSync('./proto/google/protobuf/descriptor.proto', Buffer.from(await resp.arrayBuffer()));
