//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a parsing library as a npm package that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//library should provide methods for accepting a stream or a file
//parser emits events when it parses a certain message
//user listens for events and acts based on the event
//use node events module
//webpack into a browser-compatible version
//NOTE: making this fully streaming is difficult due to how we can't detect when the internal buffer is drained and know to wait for more data
//-
//dependencies
//read .proto files with protobufjs, create an object to look up things like EDemoCommands?
var ProtoBuf = require('protobufjs');
var path = require('path');
//Long.js, handle 64 bit types
var Long = require('long');
//https://github.com/dcodeIO/ByteBuffer.js, read types out of binary data
var ByteBuffer = require("bytebuffer");
//decompress with snappy
var snappy = require('snappy');
//emit events with events
var events = require('events');
//-
//TODO
//need to construct stringtables
//need to construct sendtables
//read the protobufs and build a dota object for reference
//convert to camel case or no?
var builder = ProtoBuf.newBuilder();
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/base_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/gcsdk_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/dota_gcmessages_client.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/demo.proto'), builder);
var dota = builder.build();
//console.log(dota);
//-
var inStream = process.stdin;
var bb = new ByteBuffer();
inStream.on('data', function(data) {
    //tack on the data
    bb.append(data);
});
inStream.on('end', function() {
    console.log(bb);
    //prepare to read buffer
    bb.flip();
    //first 8 bytes=header
    var header = readString(8);
    console.log("header: %s", header);
    if (header.toString() !== "PBDEMS2\0") {
        throw "invalid header";
    }
    //next 8 bytes: appear to be two int32s related to the size of the demo file
    var size1 = readUint32();
    var size2 = readUint32();
    console.log(size1, size2);
    var stop = false;
    var count = 0;
    //next bytes are messages that need to be decoded
    //read until stream is drained or stop on OnCDemoStop
    while (!stop) {
        var msg = readOuterMessage();
        count += 1;
        stop = count > 1000;
        //for each outer message, call a function from the string name of the typeId, and decode the buf based on protos
        //we need a mapping of each possible value to a function for DemoTypes
        //a separate mapping for PacketTypes
    }
    // Read the next outer message from the buffer.
    function readOuterMessage() {
        // Read a command header, which includes both the message type
        // well as a flag to determine whether or not whether or not the
        // message is compressed with snappy.
        //command: = dota.EDemoCommands(p.reader.readVarUint32())
        var command = readVarint32();
        var tick = readVarint32();
        var size = readVarint32();
        var buf = readBytes(size);
        console.log(command, tick, size);
        // Extract the type and compressed flag out of the command
        //msgType: = int32(command & ^ dota.EDemoCommands_DEM_IsCompressed)
        //msgCompressed: = (command & dota.EDemoCommands_DEM_IsCompressed) == dota.EDemoCommands_DEM_IsCompressed
        var msgType = command & ~dota.EDemoCommands.DEM_IsCompressed;
        var msgCompressed = (command & dota.EDemoCommands.DEM_IsCompressed) === dota.EDemoCommands.DEM_IsCompressed;
        // Read the tick that the message corresponds with.
        //tick: = p.reader.readVarUint32()
        // This appears to actually be an int32, where a -1 means pre-game.
        /*
        if tick == 4294967295 {
                tick = 0
        }
        */
        if (tick === 4294967295) {
            tick = 0;
        }
        /*
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
        */
        if (msgCompressed) {
            buf = snappy.uncompressSync(buf);
        }
        /*
        // Return the message
        msg: = & outerMessage {
            tick: tick,
            typeId: msgType,
            data: buf,
        }
        return msg,
            nil
        */
        var msg = {
            tick: tick,
            typeId: msgType,
            size: size,
            isCompressed: msgCompressed,
            data: buf
        };
        console.log(msg);
        return msg;
    }

    function readVarint32() {
        return bb.readVarint32();
    }

    function readString(size) {
        return bb.readString(size);
    }

    function readUint32() {
        return bb.readUint32();
    }

    function readByte() {
        return bb.readByte();
    }

    function readBytes(size) {
        var buf = bb.slice(bb.offset, bb.offset + size).toBuffer();
        bb.offset += size;
        return buf;
    }
});
