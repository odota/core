//client side version can be generated with webpack?
//server side version can be run using node parser.js in order to give the parser its own process/memory space or embedded into an existing process
var Parser = require('../Parser');
//parser accepts a stream or buffer
//parser returns an eventemitter
var p = new Parser(process.stdin);
//add an event listener with the name of the protobuf message in order to listen for it
//listen for "*" to catch all events
//all chat
p.on("CUserMessageSayText2", function(data) {
    //console.log(data);
});
//game epilogue
p.on("CDemoFileInfo", function(data) {
    console.log(data);
});
//map pings
p.on("CDOTAUserMsg_LocationPing", function(data) {
    //console.log(data);
});
//user actions
p.on("CDOTAUserMsg_SpectatorPlayerUnitOrders", function(data){
    //console.log(data);
});
console.time('parse');
//start takes a callback function that is called when the parse completes
p.start(function(err) {
    if (err) {
        console.log(err);
    }
    console.timeEnd('parse');
});
