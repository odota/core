process.stdin.on('readable', function() {
    var header = process.stdin.read(7);
    console.log(header);
    if (header.toString() !== "PBDEMS2") {
        throw "invalid header";
    }
    console.log("yay we kind of parsed it");
    //this script reads from stdin and outputs JSON objects to stdout
    //optimally, we release a npm package capable of parsing that can be used both here and for parsing in the browser
    //should provide methods for accepting a stream or a file
    //parser emits events when it parses a certain message
    //user listens for events and acts based on the event
    //use node events module
    //webpack into a browser-compatible version
});