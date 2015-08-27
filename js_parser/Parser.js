/**
 * Class creating a Source 2 Dota 2 replay parser
 **/
var ProtoBuf = require('protobufjs');
var path = require('path');
var BitStream = require('./BitStream');
var snappy = require('snappy');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var fs = require('fs');
var stream = require('stream');
var types = require('./build/types.json');
var packetTypes = types.packets;
var demTypes = types.dems;
//read the protobufs and build a dota object for reference
var builder = ProtoBuf.newBuilder();
var protos = fs.readdirSync(path.join(__dirname, "proto"));
protos.forEach(function(p) {
    ProtoBuf.loadProtoFile(path.join(__dirname, "proto", p), builder);
});
var dota = builder.build();
var Parser = function(input) {
    //wrap a passed buffer in a stream
    if (Buffer.isBuffer(input)) {
        var bufferStream = new stream.PassThrough();
        bufferStream.end(input);
        input = bufferStream;
    }
    var stop = false;
    var ee = this;
    ee.on("CDemoError", function(msg) {
        stop = true;
    });
    ee.on("CDemoStop", function(msg) {
        stop = true;
    });
    ee.on("CDemoStringTables", readCDemoStringTables);
    ee.on("CDemoPacket", readCDemoPacket);
    ee.on("CDemoFullPacket", function(msg) {
        //TODO this appears to be a packet with a string table attached?
        //use case 6 to process the stringtable
        //use case 7 to process the packet
    });
    ee.on("start", function(cb) {
        async.series({
            "header": function(cb) {
                readString(8, function(err, header) {
                    //verify the file magic number is correct
                    cb(err || header.toString() !== "PBDEMS2\0", header);
                });
            },
            //two uint32s related to replay size
            "size1": readUint32,
            "size2": readUint32,
            "demo": function(cb) {
                //keep parsing demo messages until it hits a stop condition
                async.until(function() {
                    return stop;
                }, readDemoMessage, cb);
            }
        }, cb);
    });
    return ee;
    // Read the next DEM message from the replay (outer message)
    function readDemoMessage(cb) {
        async.series({
            command: readVarint32,
            tick: readVarint32,
            size: readVarint32
        }, function(err, result) {
            if (err) {
                return cb(err);
            }
            readBytes(result.size, function(err, buf) {
                // Read a command header, which includes both the message type
                // well as a flag to determine whether or not whether or not the
                // message is compressed with snappy.
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
                    data: buf
                };
                //TODO skip dems not being listened for
                if (demTypes[msg.typeId]) {
                    //lookup the name of the protobuf message to decode with
                    var name = demTypes[msg.typeId];
                    if (dota[name]) {
                        msg.data = dota[name].decode(msg.data);
                        ee.emit("*", msg);
                        ee.emit(name, msg);
                    }
                }
                return cb(err);
            });
        });
    }
    // Internal parser for callback OnCDemoPacket, responsible for extracting
    // multiple inner packets from a single CDemoPacket. This is the main structure
    // that contains all other data types in the demo file.
    function readCDemoPacket(msg) {
        /*
        message CDemoPacket {
        	optional int32 sequence_in = 1;
        	optional int32 sequence_out_ack = 2;
        	optional bytes data = 3;
        }
        */
        //the inner data of a CDemoPacket is raw bits (no longer byte aligned!)
        //convert the buffer object into a bitstream so we can read from it
        //read until less than 8 bits left
        var bitStream = new BitStream(msg.data.data);
        while (bitStream.limit - bitStream.offset >= 8) {
            var type = bitStream.readUBitVarPacketType();
            var size = bitStream.readVarUInt();
            var bytes = bitStream.readBuffer(size * 8);
            //console.log(kind, size, bytes);
            //TODO skip packets not being listened for
            if (type in packetTypes) {
                //lookup the name of the proto message for this packet type
                var protoName = packetTypes[type];
                var decoded = dota[protoName].decode(bytes);
                ee.emit("*", decoded);
                ee.emit(protoName, decoded);
                //console.log(protoName, decoded);
            }
            //TODO reading entities, how to do this?
            //TODO push the packets of this message into an array and sort them by priority
        }
        return;
    }

    function readCDemoStringTables(msg) {
        //TODO need to construct stringtables to look up things like combat log names
        //TODO rather than processing when we get this demo message, we want to create when we read the packet CSVCMsg_CreateStringTable?
        //console.log(msg);
        for (var i = 0; i < msg.data.tables.length; i++) {
            console.log(Object.keys(msg.data.tables[i]));
            console.log(msg.data.tables[i].table_name);
            /*
            if (msg.tables[i].table_name == "userinfo") {
                for (var j = 0; j < msg.tables[i].items.length; ++j) {
                    var data = msg.tables[i].items[j].data;
                    var info = {};
                    if (data != null) {
                        data = data.clone();
                        info.xuid = data.readUint64();
                        info.name = data.readUTF8String(32);
                        info.userID = data.readUint32();
                        info.guid = data.readBytes(33);
                        info.friendsID = data.readUint32();
                        info.friendsName = data.readBytes(32);
                        info.fakeplayer = data.readUint32();
                        info.ishltv = data.readUint32();
                        info.customFiles = data.readArray(4, function() {
                            return data.readUint32();
                        });
                        info.filesDownloaded = data.readUint8();
                        console.log(info);
                    }
                }
            }
            */
        }
    }

    function readByte(cb) {
        readBytes(1, function(err, buf) {
            cb(err, buf.readInt8());
        });
    }

    function readString(size, cb) {
        readBytes(size, function(err, buf) {
            cb(err, buf.toString());
        });
    }

    function readUint32(cb) {
        readBytes(4, function(err, buf) {
            cb(err, buf.readUInt32LE());
        });
    }

    function readVarint32(cb) {
        readByte(function(err, tmp) {
            if (tmp >= 0) {
                return cb(err, tmp);
            }
            var result = tmp & 0x7f;
            readByte(function(err, tmp) {
                if (tmp >= 0) {
                    result |= tmp << 7;
                    return cb(err, result);
                }
                else {
                    result |= (tmp & 0x7f) << 7;
                    readByte(function(err, tmp) {
                        if (tmp >= 0) {
                            result |= tmp << 14;
                            return cb(err, result);
                        }
                        else {
                            result |= (tmp & 0x7f) << 14;
                            readByte(function(err, tmp) {
                                if (tmp >= 0) {
                                    result |= tmp << 21;
                                    return cb(err, result);
                                }
                                else {
                                    result |= (tmp & 0x7f) << 21;
                                    readByte(function(err, tmp) {
                                        result |= tmp << 28;
                                        if (tmp < 0) {
                                            err = "malformed varint detected";
                                        }
                                        return cb(err, result);
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    function readBytes(size, cb) {
        if (!size) {
            //return an empty buffer if reading 0 bytes
            return cb(null, new Buffer(""));
        }
        var buf = input.read(size);
        if (buf) {
            cb(null, buf);
        }
        else {
            //TODO this will wait forever if the replay terminates abruptly?
            input.once('readable', function() {
                return readBytes(size, cb);
            });
        }
    }
};
util.inherits(Parser, EventEmitter);
Parser.prototype.start = function start(cb) {
    this.emit("start", cb);
};
module.exports = Parser;