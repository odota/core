import ProtoBuf from 'protobufjs';
import fs from 'fs';

/*
const files = fs.readdirSync('./proto');
const builder = ProtoBuf.newBuilder();
files.forEach((file) => {
  // console.log(file);
  ProtoBuf.loadProtoFile(`./proto/${file}`, builder);
});
*/

const builder = ProtoBuf.loadProtoFile('./proto/dota_match_metadata.proto');
const Message = builder.build();
const buf = fs.readFileSync('./2750586075_1028519576.meta');
const message = Message.CDOTAMatchMetadataFile.decode(buf);
message.metadata.teams.forEach((team) => {
  team.players.forEach((player) => {
    player.equipped_econ_items.forEach((item) => {
      delete item.attribute;
    });
  });
});
delete message.private_metadata;
console.log(JSON.stringify(message, null, 2));
/*
const entries = [];
for (let i = 0; i < 1000000; i += 1) {
  entries.push({
    a: i,
    b: i / 7,
    c: 'asdf',
  });
}
console.time('JSON');
JSON.parse(JSON.stringify(entries));
console.timeEnd('JSON');
console.time('map');s
entries.map(e => Object.assign({}, e));
console.timeEnd('map');
*/
