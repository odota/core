import { spawn } from "child_process";
import { buffer } from "stream/consumers";
import ProtoBuf from "protobufjs";

const url = "http://replay152.valve.net/570/7503212404_1277518156.meta.bz2";
const root = new ProtoBuf.Root();
const builder = root.loadSync("./proto/dota_match_metadata.proto", {
  keepCase: true,
});
const CDOTAMatchMetadataFile = builder.lookupType("CDOTAMatchMetadataFile");

console.time('fetch');
const resp = await fetch(url);
const inBuf = Buffer.from(await resp.arrayBuffer());
console.timeEnd('fetch');
console.time('bz');
const bz = spawn(`bunzip2`);
bz.stdin.write(inBuf);
bz.stdin.end();
const outBuf = await buffer(bz.stdout);
console.timeEnd('bz');
console.time('parse');
const message: any = CDOTAMatchMetadataFile.decode(outBuf);
console.timeEnd('parse');
console.log(message);
