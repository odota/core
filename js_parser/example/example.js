//parser accepts a stream or buffer
//optimally, this project is released as a library that can be used server or client side
//client side version can be generated with webpack?
//the server side version can be run using node parser.js in order to give the parser its own process/memory space
//parser returns an eventemitter, ee emits events when it parses a certain message
//user listens for events and acts based on the event
//listen for "*" to catch all events
var Parser = require('../Parser');
var p = new Parser(process.stdin);
p.on("CUserMessageSayText2", function(msg) {
    console.log(msg);
});
console.time('parse');
p.start(function(err) {
    if (err) {
        console.log(err);
    }
    console.timeEnd('parse');
});
