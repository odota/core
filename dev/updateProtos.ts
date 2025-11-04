import axios from 'axios';
import fs from 'node:fs';

// Fetch protos from https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_match_metadata.proto
await updateProtos();
async function updateProtos() {
  const resp = await axios.get(
    'https://api.github.com/repos/SteamDatabase/GameTracking-Dota2/git/trees/master?recursive=1',
  );
  const files = resp.data.tree;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.path.startsWith('Protobufs/')) {
      console.log(file.path);
      const name = file.path.split('/').slice(-1)[0];
      const resp2 = await axios.get(
        'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/' +
          file.path,
        { responseType: 'arraybuffer' },
      );
      fs.writeFileSync('./proto/' + name, resp2.data);
    }
  }
}
