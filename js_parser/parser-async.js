//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a parsing library as a npm package that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//library should provide methods for accepting a stream or a file
//parser emits events when it parses a certain message
//user listens for events and acts based on the event
//use node events module
//webpack into a browser-compatible version
//options either everything needs to be async or we need to read the entire replay into a buffer first
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
var async = require('async');
//-
//TODO
//need to construct stringtables
//need to construct sendtables
//read the protobufs and build a dota object for reference
var builder = ProtoBuf.newBuilder();
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/base_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/gcsdk_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/dota_gcmessages_client.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/demo.proto'), builder);
var dota = builder.build();
//console.log(dota);
//-
var inStream = process.stdin;
var stop = false;
var count = 0;
inStream.once('readable', function() {
    async.series({
        "header": function(cb) {
            readString(8, function(err, header) {
                cb(err || header.toString() !== "PBDEMS2\0", header);
            });
        },
        //two uint32s related to replay size
        "size1": readUint32,
        "size2": readUint32
    }, function(err, result) {
        if (err) {
            throw err;
        }
        console.log(result);
        async.whilst(function() {
            return !stop;
        }, function(cb) {
            count += 1;
            stop = count > 10;
            readOuterMessage(function(err, msg) {
                console.log(err, msg);
                //TODO do things with the outer message
                //call a function based on the typeId, decode the buf
                //stop on cdemostop
                return cb(err);
            });
        }, function(err) {
            console.log(err);
            console.log('done parsing replay!');
        });
    });
    // Read the next outer message from the buffer.
    function readOuterMessage(cb) {
        // Read a command header, which includes both the message type
        // well as a flag to determine whether or not whether or not the
        // message is compressed with snappy.
        //command: = dota.EDemoCommands(p.reader.readVarUint32())
        async.series({
            command: readVarint32,
            tick: readVarint32,
            size: readVarint32
        }, function(err, result) {
            console.log(err, result);
            readBytes(result.size, function(err, buf) {
                var command = result.command;
                var tick = result.tick;
                var size = result.size;
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
                if (msgCompressed) {
                    buf = snappy.uncompressSync(buf);
                }
                var msg = {
                    tick: tick,
                    typeId: msgType,
                    size: size,
                    isCompressed: msgCompressed,
                    data: buf
                };
                return cb(null, msg);
            });
        });
    }

    function readVarint32(cb) {
        readByte(function(err, tmp) {
            if (tmp >= 0) {
                return cb(null, tmp);
            }
            var result = tmp & 0x7f;
            readByte(function(err, tmp) {
                if (tmp >= 0) {
                    result |= tmp << 7;
                    return cb(null, result);
                }
                else {
                    result |= (tmp & 0x7f) << 7;
                    readByte(function(err, tmp) {
                        if (tmp >= 0) {
                            result |= tmp << 14;
                            return cb(null, result);
                        }
                        else {
                            result |= (tmp & 0x7f) << 14;
                            readByte(function(err, tmp) {
                                if (tmp >= 0) {
                                    result |= tmp << 21;
                                    return cb(null, result);
                                }
                                else {
                                    result |= (tmp & 0x7f) << 21;
                                    readByte(function(err, tmp) {
                                        result |= tmp << 28;
                                        if (tmp < 0) {
                                            throw "malformed varint detected";
                                        }
                                        return cb(null, result);
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    function readByte(cb) {
        readBytes(1, function(err, buf) {
            cb(err, ByteBuffer.wrap(buf).readByte());
        });
    }

    function readString(size, cb) {
        readBytes(size, function(err, buf) {
            cb(err, ByteBuffer.wrap(buf).readString(size));
        });
    }

    function readUint32(cb) {
        readBytes(4, function(err, buf) {
            cb(err, ByteBuffer.wrap(buf).readUint32());
        });
    }

    function readBytes(size, cb) {
        if (!size) {
            return cb(null, new Buffer(""));
        }
        var buf = inStream.read(size);
        if (buf) {
            cb(null, buf);
        }
        else {
            inStream.once('readable', function() {
                return readBytes(size, cb);
            });
        }
    }
});