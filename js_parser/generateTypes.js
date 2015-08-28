/**
 * Generates a mapping of ids to protobuf message names
 **/
var fs = require('fs');
var ProtoBuf = require('protobufjs');
var path = require('path');
var builder = ProtoBuf.newBuilder();
var protos = fs.readdirSync(path.join(__dirname, "proto"));
protos.forEach(function(p) {
    ProtoBuf.loadProtoFile(path.join(__dirname, "proto", p), builder);
});
var dota = builder.build();
//maintain a mapping for PacketTypes of id to string so we can emit events for different packet types.
//we want to generate them automatically from the protobufs
var packetEnums = {
    "NET_Messages": {
        abbr: "net_",
        full: "CNETMsg_"
    },
    "SVC_Messages": {
        abbr: "svc_",
        full: "CSVCMsg_"
    },
    "EBaseUserMessages": {
        abbr: "UM_",
        full: "CUserMessage"
    },
    "EBaseEntityMessages": {
        abbr: "EM_",
        full: "CEntityMessage"
    },
    "EBaseGameEvents": {
        abbr: "GE_",
        full: "CMsg"
    },
    "EDotaUserMessages": {
        abbr: "DOTA_UM_",
        full: "CDOTAUserMsg_"
    }
};
var demoEnums = {
    "EDemoCommands": {
        abbr: "DEM_",
        full: "CDemo",
    }
};
var types = {
    packets: generate(packetEnums),
    dems: generate(demoEnums)
};
types["DOTA_CHAT_MESSAGE"] = reverse(dota["DOTA_CHAT_MESSAGE"]);
types["DOTA_COMBATLOG_TYPES"] = reverse(dota["DOTA_COMBATLOG_TYPES"]);
fs.writeFileSync(path.join(__dirname, 'types.json'), JSON.stringify(types, null, 2));

function generate(enums) {
    //using the dota object, each dota[enumName] is an object mapping an internal name to its packet number
    //enum EBaseUserMessages { 
    //UM_AchievementEvent = 101;
    //process into -> CUserMessageAchievementEvent
    var types = {};
    for (var key in enums) {
        var obj = dota[key];
        for (var key2 in obj) {
            var protoName = key2.replace(enums[key].abbr, enums[key].full);
            types[obj[key2]] = protoName;
        }
    }
    return types;
}

function reverse(en) {
    //accepts an object
    //flip the mapping to id->string
    var ret = {};
    for (var key in en) {
        ret[en[key]] = key;
    }
    return ret;
}