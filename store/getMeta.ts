import ProtoBuf from 'protobufjs';
import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import redis from './redis';
import { buildReplayUrl, redisCount } from '../util/utility';
import { readGcData } from './getGcData';
const execPromise = promisify(exec);

// Get a sample meta file
// curl http://replay117.valve.net/570/7468445438_1951738768.meta.bz2

const root = new ProtoBuf.Root();
const builder = root.loadSync('./proto/dota_match_metadata.proto', {
  keepCase: true,
});
const Message = builder.lookupType('CDOTAMatchMetadataFile');

export async function getMeta(matchId: string) {
  const gcdata = await readGcData(Number(matchId));
  if (!gcdata) {
    return null;
  }
  const url = buildReplayUrl(
    gcdata.match_id,
    gcdata.cluster,
    gcdata.replay_salt,
    true,
  );
  // Parse it from url
  // This takes about 50ms of CPU time per match
  const message = await getMetaFromUrl(url);
  if (message) {
    // Count the number of meta parses
    redisCount(redis, 'meta_parse');
  }
  // Return the info, it may be null if we failed at any step or meta isn't available
  return message;
}

export async function getMetaFromUrl(url: string) {
  try {
    // From testing it seems download takes about 1s and unzip about 9ms
    // We pipeline them here for efficiency
    // If we want to cache meta files, we can cache the bz2 versions and it won't add very much parse time
    console.time('[METAPARSE]: download/bunzip');
    const { stdout } = await execPromise(
      `curl -L ${url} | bunzip2`,
      //@ts-ignore
      { shell: true, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
    );
    console.timeEnd('[METAPARSE]: download/bunzip');
    console.time('[METAPARSE]: parse');
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
    console.timeEnd('[METAPARSE]: parse');
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
