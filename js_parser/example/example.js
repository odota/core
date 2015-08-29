var Parser = require('../Parser');
//parser accepts a stream or buffer, returns an eventemitter
var p = new Parser(process.stdin);
//PROPERTIES
var types = p.types;
var game_event_descriptors = p.game_event_descriptors;
var string_tables = p.string_tables;
var entities = p.entities;
//LISTENERS
//TODO list the general categories of events the user can listen for in readme
//add an event listener with the name of the protobuf message/game event in order to listen for it
//full dem/packet listing is in build/types.json, or user can refer to original .proto files
//WARNING: not every type listed there is actually in the replay--it's automatically generated from enums in .protos!
//gameevent types are not listed in the .protos, but are defined in the GameEventDescriptors contained within a replay
//therefore we don't know what game event types are available until runtime
//game epilogue
p.on("CDemoFileInfo", function(data) {
    console.log(data);
});
//all chat
p.on("CUserMessageSayText2", function(data) {
    //console.log(data);
});
//map pings
p.on("CDOTAUserMsg_LocationPing", function(data) {
    //console.log(data);
});
//user actions
p.on("CDOTAUserMsg_SpectatorPlayerUnitOrders", function(data) {
    //console.log(data);
});
//objectives
p.on("CDOTAUserMsg_ChatEvent", function(data) {
    //look up the type with DOTA_CHAT_MESSAGE
    data.type = types.DOTA_CHAT_MESSAGE[data.type];
    //console.log(data);
});
//combat log
p.on("dota_combatlog", function(data) {
    //look up the type with DOTA_COMBATLOG_TYPES
    data.type = types.DOTA_COMBATLOG_TYPES[data.type];
    //translate the entries using stringtables
    var combatLogNames = p.string_tables.byName["CombatLogNames"];
    //following fields can require a translation, but whether they do is dependent on the combat log type
    //if that particular type doesn't have the field set to an actual string table entry, it can be undefined
    //data.sourcename = combatLogNames.string_data[data.sourcename].key;
    //data.targetname = combatLogNames.string_data[data.targetname].key;
    //data.attackername = combatLogNames.string_data[data.attackername].key;
    //data.inflictorname = combatLogNames.string_data[data.inflictorname].key;
    //data.targetsourcename = combatLogNames.string_data[data.targetsourcename].key;
    //value can sometimes needs a translation (for example, purchases), other times it's just an integer
    //data.valuename = combatLogNames[data.value].key;
    //console.log(data);
});
//everything
//p.on("*", function(data){console.log(data);})
console.time('parse');
//start takes a callback function that is called when the parse completes
p.start(function(err) {
    if (err) {
        console.log(err);
    }
    console.timeEnd('parse');
});
