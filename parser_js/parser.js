//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a npm package capable of parsing that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//should provide methods for accepting a stream or a file
//parser emits events when it parses a certain message
//user listens for events and acts based on the event
//use node events module
//webpack into a browser-compatible version

//replay format
//first 8 bytes=header
//next 8 bytes: appear to be two int32s related to the size of the demo file
//next bytes are messages that need to be decoded
//stop on OnCDemoStop
//need to construct stringtables
//need to construct sendtables
process.stdin.on('readable', function() {
    var header = process.stdin.read(7);
    console.log(header);
    if (header.toString() !== "PBDEMS2") {
        throw "invalid header";
    }
    console.log("yay we kind of parsed it");
});