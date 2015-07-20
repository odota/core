//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a parsing library as a npm package that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//library should provide methods for accepting a stream or a file
//parser emits events when it parses a certain message
//user listens for events and acts based on the event
//use node events module
//webpack into a browser-compatible version
//-
//dependencies
//read .proto files with protobufjs, create an object to look up things like EDemoCommands?
//decompress with snappy
//emit events with events
//Long.js, handle 64 bit types
//https://github.com/dcodeIO/ByteBuffer.js, read types out of binary data
//-
//TODO
//need to construct stringtables
//need to construct sendtables
var inStream = process.stdin;
inStream.on('readable', function() {
    //first 8 bytes=header
    var header = inStream.read(8);
    console.log(header);
    if (header.toString() !== "PBDEMS2\0") {
        throw "invalid header";
    }
    //next 8 bytes: appear to be two int32s related to the size of the demo file
    var sizeData = inStream.read(8);
    console.log(sizeData);
    var stop = false;
    //next bytes are messages that need to be decoded
    //read until stream is drained or stop on OnCDemoStop
    while (!stop) {
        readOuterMessage();
        //keep track of the current tick of the replay?
        // Invoke callbacks for the given message type.
        /*
		if err = p.CallByDemoType(msg.typeId, msg.data); err != nil {
			return err
		}
		*/
    }
    // Read the next outer message from the buffer.
    function readOuterMessage() {
        // Read a command header, which includes both the message type
        // well as a flag to determine whether or not whether or not the
        // message is compressed with snappy.
        command: = dota.EDemoCommands(p.reader.readVarUint32())
            // Extract the type and compressed flag out of the command
        msgType: = int32(command & ^ dota.EDemoCommands_DEM_IsCompressed)
        msgCompressed: = (command & dota.EDemoCommands_DEM_IsCompressed) == dota.EDemoCommands_DEM_IsCompressed
            // Read the tick that the message corresponds with.
        tick: = p.reader.readVarUint32()
            // This appears to actually be an int32, where a -1 means pre-game.
        if tick == 4294967295 {
            tick = 0
        }
        // Read the size and following buffer.
        size: = int(p.reader.readVarUint32())
        buf: = p.reader.readBytes(size)
            // If the buffer is compressed, decompress it with snappy.
        if msgCompressed {
            var err error
            if buf, err = snappy.Decode(nil, buf);
            err != nil {
                return nil, err
            }
        }
        // Return the message
        msg: = & outerMessage {
            tick: tick,
            typeId: msgType,
            data: buf,
        }
        return msg,
        nil
    }
});