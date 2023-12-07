import ProtoBuf from 'protobufjs';
import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

// Get a sample meta file
// curl http://replay117.valve.net/570/7468445438_1951738768.meta.bz2

const root = new ProtoBuf.Root();
const builder = root.loadSync('./proto/dota_match_metadata.proto', {
  keepCase: true,
});
const Message = builder.lookupType('CDOTAMatchMetadataFile');

export async function getMeta(url: string) {
  try {
    console.time('download/bunzip');
    const { stdout } = await execPromise(
      `curl -L ${url} | bunzip2`,
      //@ts-ignore
      { shell: true, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
    );
    console.timeEnd('download/bunzip');
    console.time('metaParse');
    const message: any = Message.decode(stdout);
    // message.metadata.teams.forEach((team) => {
    //   team.players.forEach((player) => {
    //     player.equipped_econ_items?.forEach((item) => {
    // delete item.attribute;
    //     });
    //   });
    // });
    // This is encrypted in some way and it's not clear how to read it
    delete message.private_metadata;
    console.timeEnd('metaParse');
    return message;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// await updateProtos();
// Fetch protos from https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_match_metadata.proto
async function updateProtos() {
  const resp = await axios.get(
    'https://api.github.com/repos/SteamDatabase/GameTracking-Dota2/git/trees/master?recursive=1'
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
        { responseType: 'arraybuffer' }
      );
      fs.writeFileSync('./proto/' + name, resp2.data);
    }
  }
}
