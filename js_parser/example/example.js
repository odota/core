var Parser = require('../Parser');
//parser accepts a stream or buffer, returns an eventemitter
var p = new Parser(process.stdin);
//TODO list the general categories of events the user can listen for in readme
//add an event listener with the name of the protobuf message in order to listen for it
//full dem/packet listing is in build/types.json, or user can refer to original .proto files
//WARNING: not every type listed there is actually in the replay--it's automatically generated from enums in .protos!
//gameevent types are not listed in the .protos, but are defined in the GameEventDescriptors contained within a replay
//therefore we don't know what game event types are available until runtime
//-
//EXAMPLES
//game epilogue
p.on("CDemoFileInfo", function(data) {
    console.log(data);
});
/*
//all chat
p.on("CUserMessageSayText2", function(data) {
    //console.log(data);
});
//map pings
p.on("CDOTAUserMsg_LocationPing", function(data) {
    //console.log(data);
});
//user actions
p.on("CDOTAUserMsg_SpectatorPlayerUnitOrders", function(data){
    //console.log(data);
});
//objectives
p.on("CDOTAUserMsg_ChatEvent", function(data) {
    //look up the type with DOTA_CHAT_MESSAGES
    //console.log(data);
});
//combat log
p.on("dota_combatlog", function(data){
//look up the type with DOTA_COMBATLOG_TYPES
//translate the entries using stringtables    
});
//everything
p.on("*", function(data){console.log(data);})
*/
console.time('parse');
//start takes a callback function that is called when the parse completes
p.start(function(err) {
    if (err) {
        console.log(err);
    }
    console.timeEnd('parse');
});
