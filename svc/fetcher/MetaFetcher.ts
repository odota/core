import ProtoBuf from "protobufjs";
import { spawn } from "node:child_process";
import { buildReplayUrl } from "../util/utility.ts";
import { MatchFetcherBase } from "./MatchFetcherBase.ts";
import { GcdataFetcher } from "./GcdataFetcher.ts";
import { redisCount } from "../store/redis.ts";
import { buffer } from "node:stream/consumers";

const gcFetcher = new GcdataFetcher();

// Get a sample meta file
// curl http://replay117.valve.net/570/7468445438_1951738768.meta.bz2

const root = new ProtoBuf.Root();
const builder = root.loadSync("./proto/dota_match_metadata.proto", {
  keepCase: true,
});
const CDOTAMatchMetadataFile = builder.lookupType("CDOTAMatchMetadataFile");

export class MetaFetcher extends MatchFetcherBase<Record<string, any>> {
  getData = async (matchId: number) => {
    const result = await this.fetchData(matchId);
    return result.data;
  };
  fetchData = async (matchId: number) => {
    const gcdata = await gcFetcher.getData(matchId);
    if (!gcdata) {
      return { data: null, error: "no gcdata" };
    }
    const url = buildReplayUrl(
      gcdata.match_id,
      gcdata.cluster,
      gcdata.replay_salt,
      true,
    );
    // Timings:
    // DL: 1072ms (curl http://replay152.valve.net/570/7503212404_1277518156.meta.bz2)
    // bunzip2: 13ms (bunzip2 7503212404_1277518156.meta.bz2)
    // parse: ~50ms
    // If we want to cache meta files, we can cache the bz2 versions and it won't add very much parse time
    const start = Date.now();
    const resp = await fetch(url);
    const bzIn = Buffer.from(await resp.arrayBuffer());
    const bz = spawn(`bunzip2`);
    bz.stdin.write(bzIn);
    bz.stdin.end();
    const outBuf = await buffer(bz.stdout);
    const message: any = CDOTAMatchMetadataFile.decode(outBuf);
    // message.metadata.teams.forEach((team) => {
    //   team.players.forEach((player) => {
    //     player.equipped_econ_items?.forEach((item) => {
    // delete item.attribute;
    //     });
    //   });
    // });
    // This is encrypted in some way, see https://github.com/thedanill/dota_crypto (may require Dota plus subscription to request key)
    delete message.private_metadata;
    const end = Date.now();
    console.log("[METAPARSE] %dms", end - start);
    if (message) {
      // Count the number of meta parses
      redisCount("meta_parse");
    }
    // Return the info, it may be null if we failed at any step or meta isn't available
    return { data: message, error: null };
  };
  checkAvailable = () => {
    throw new Error("not implemented");
  };
}
