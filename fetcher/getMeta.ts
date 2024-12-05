import ProtoBuf from 'protobufjs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { buildReplayUrl, redisCount } from '../util/utility';
import { readGcData } from './getGcData';
const execPromise = promisify(exec);

// Get a sample meta file
// curl http://replay117.valve.net/570/7468445438_1951738768.meta.bz2

const root = new ProtoBuf.Root();
const builder = root.loadSync('./proto/dota_match_metadata.proto', {
  keepCase: true,
});
const CDOTAMatchMetadataFile = builder.lookupType('CDOTAMatchMetadataFile');

export async function getMeta(matchId: number) {
  const gcdata = await readGcData(matchId);
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
  const message = await getMetaFromUrl(url);
  if (message) {
    // Count the number of meta parses
    redisCount('meta_parse');
  }
  // Return the info, it may be null if we failed at any step or meta isn't available
  return message;
}

export async function getMetaFromUrl(url: string) {
  try {
    // Timings:
    // DL: 1072ms (curl http://replay152.valve.net/570/7503212404_1277518156.meta.bz2)
    // bunzip2: 13ms (bunzip2 7503212404_1277518156.meta.bz2)
    // parse: ~50ms
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
    const message: any = CDOTAMatchMetadataFile.decode(stdout);
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
