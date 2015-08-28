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
    var p = this;
    //p.on("CDemoSignonPacket", readCDemoPacket);
    //p.on("CDemoStringTables", readCDemoStringTables);
    p.on("CDemoPacket", readCDemoPacket);
    p.on("CDemoFullPacket", function(data) {
        //console.log(data);
        readCDemoStringTables(data.string_table);
        readCDemoPacket(data.packet);
    });
    p.on("CSVCMsg_CreateStringTable", function(data) {
        console.log(data);
    });
    p.on("CDOTAUserMsg_ChatEvent", function(data) {
        //objectives
        //TODO need to translate type id to friendly name
        //console.log(data);
    });
    p.on("CSVCMsg_GameEventList", function(data) {
        console.log(data);
    });
    p.on("CSVCMsg_GameEvent", function(data) {
        console.log(data);
    });
    /*
    p.on("CMsgSource1LegacyGameEventList", function(data) {
        //TODO where are these?  need descriptors to get game event names
        console.log(data);
    });
    p.on("CMsgSource1LegacyListenEvents", function(data) {
        console.log(data);
    });
    p.on("CMsgSource1LegacyGameEvent", function(data) {
        //console.log(data);
    });
    p.on("CDOTAUserMsg_CombatLogData", function(data) {
        console.log(data);
    });
    */
    p.start = function start(cb) {
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
                }, readDemoMessage, function(err){
                    console.log("stop");
                    console.log("%s err finishdem", err);
                    cb(err);
                });
            }
        }, function(err) {
            console.log("%s err exit", err);
        });
    };
    return p;
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
                var dem = {
                    tick: tick,
                    type: msgType,
                    size: size,
                    data: buf
                };
                if (msgType in demTypes) {
                    //lookup the name of the protobuf message to decode with
                    var name = demTypes[msgType];
                    if (dota[name] && p.listeners(name).length) {
                        dem.data = dota[name].decode(dem.data);
                        p.emit("*", dem.data);
                        p.emit(name, dem.data);
                    }
                }
                return cb(err);
            });
        });
    }
    // Internal parser for callback OnCDemoPacket, responsible for extracting
    // multiple inner packets from a single CDemoPacket. This is the main structure
    // that contains all other data types in the demo file.
    function readCDemoPacket(data) {
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
        var bitStream = new BitStream(data.data);
        while (bitStream.limit - bitStream.offset >= 8) {
            var type = bitStream.readUBitVarPacketType();
            var size = bitStream.readVarUInt();
            var buf = bitStream.readBuffer(size * 8);
            var packet = {
                type: type,
                size: size,
                data: buf
            };
            var t = packetTypes[type] || type;
            ct[t] = ct[t] ? ct[t] + 1 : 1;
            if (type in packetTypes) {
                //lookup the name of the proto message for this packet type
                var name = packetTypes[type];
                if (dota[name] && p.listeners(name).length) {
                    packet.data = dota[name].decode(packet.data);
                    p.emit("*", packet.data);
                    p.emit(name, packet.data);
                }
            }
            //TODO reading entities, how to do this?
            //TODO push the packets of this message into an array and sort them by priority
        }
    }

    function readCDemoStringTables(data) {
        //TODO need to construct stringtables to look up things like combat log names
        //TODO rather than processing when we get this demo message, we want to create when we read the packet CSVCMsg_CreateStringTable?
        for (var i = 0; i < data.tables.length; i++) {
            //console.log(Object.keys(data.tables[i]));
            //console.log(data.tables[i].table_name);
        }
    }

    function readByte(cb) {
        readBytes(1, function(err, buf) {
            if (!buf) {
                return cb(err);
            }
            cb(err, buf.readInt8());
        });
    }

    function readString(size, cb) {
        readBytes(size, function(err, buf) {
            if (!buf) {
                return cb(err);
            }
            cb(err, buf.toString());
        });
    }

    function readUint32(cb) {
        readBytes(4, function(err, buf) {
            if (!buf) {
                return cb(err);
            }
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
            input.on('end', function() {
                stop = true;
                return cb();
            });
            input.once('readable', function() {
                input.removeAllListeners();
                return readBytes(size, cb);
            });
        }
    }
};
util.inherits(Parser, EventEmitter);
module.exports = Parser;
var ct = {};