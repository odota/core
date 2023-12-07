import ProtoBuf from 'protobufjs';
import fs from 'fs';
import axios from 'axios';

// Fetch protos from https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_match_metadata.proto
if (false) {
const resp = await axios.get('https://api.github.com/repos/SteamDatabase/GameTracking-Dota2/git/trees/master?recursive=1');
const files = resp.data.tree;
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (file.path.startsWith('Protobufs/')) {
    console.log(file.path);
    const name = file.path.split('/').slice(-1)[0];
    const resp2 = await axios.get('https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/' + file.path, { responseType: 'arraybuffer' });
    fs.writeFileSync('./proto/' + name, resp2.data);
  }
}
// Get a sample meta file
// curl http://replay117.valve.net/570/7468445438_1951738768.meta.bz2
}

const builder = ProtoBuf.loadSync('./proto/dota_match_metadata.proto');
const Message = builder.lookupType('CDOTAMatchMetadataFile');
const buf = fs.readFileSync('./dev/7468445438_1951738768.meta');
const message: any = Message.decode(buf);
message.metadata.teams.forEach((team) => {
  team.players.forEach((player) => {
    player.equipped_econ_items?.forEach((item) => {
      // delete item.attribute;
    });
  });
});
// This is encrypted in some way and it's not clear how to read it
delete message.private_metadata;
fs.writeFileSync('./dev/7468445438_meta.json', JSON.stringify(message, null, 2));
// Stats: Original bzip2, 77kb, unzipped, 113kb, parsed JSON 816kb
