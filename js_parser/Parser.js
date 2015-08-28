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
//CDemoSignonPacket is a special case and should be decoded with CDemoPacket since it doesn't have its own protobuf
//it appears that things like the gameeventlist and createstringtables calls are here?
dota["CDemoSignonPacket"] = dota["CDemoPacket"];
//console.log(Object.keys(dota));
var Parser = function(input) {
    //wrap a passed buffer in a stream
    //TODO this isn't tested yet
    if (Buffer.isBuffer(input)) {
        var bufferStream = new stream.PassThrough();
        bufferStream.end(input);
        input = bufferStream;
    }
    var stop = false;
    var gameEventDescriptors = {};
    var p = this;
    /**
     * Internal listeners to automatically process certain packets such as string tables.
     * We abstract this away from the user so they don't need to worry about it.
     * For optimal speed we could allow the user to disable these.
     */
    p.on("CDemoStop", function(data) {
        //don't stop on CDemoStop since some replays have CDemoGameInfo after it
        //stop = true;
    });
    //p.on("CDemoStringTables", readCDemoStringTables);
    p.on("CDemoSignonPacket", readCDemoPacket);
    p.on("CDemoPacket", readCDemoPacket);
    p.on("CDemoFullPacket", function(data) {
        //console.log(data);
        readCDemoStringTables(data.string_table);
        readCDemoPacket(data.packet);
    });
    //string tables may mutate over the lifetime of the replay.
    //Therefore we listen for create/update events and modify the table as needed.
    p.on("CSVCMsg_CreateStringTable", function(data) {
        //TODO create/update string table
        //console.log(data);
    });
    p.on("CSVCMsg_UpdateStringTable", function(data) {
        //TODO create/update string table
        //console.log(data);
    });
    p.on("CDOTAUserMsg_ChatEvent", function(data) {
        //objectives
        //TODO need to translate type id to friendly name--or maybe just let the user do it since the data should be in dota.DOTA_CHAT_MESSAGE
        //console.log(data);
    });
    //emitted once, this packet sets up the information we need to read gameevents
    p.on("CMsgSource1LegacyGameEventList", function(data) {
        console.log(data);
        for (var i = 0; i < data.descriptors.length; i++) {
            gameEventDescriptors[data.descriptors[i].eventid] = data.descriptors[i];
        }
    });
    //we process the gameevent using knowledge obtained from the gameeventlist
    p.on("CMsgSource1LegacyGameEvent", function(data) {
        //get the event name from descriptor
        //console.log(data);
        //console.log(gameEventDescriptors);
        data.event_name = gameEventDescriptors[data.eventid].name;
        var e = {};
        data.keys.forEach(function(k, i) {
            var key = gameEventDescriptors[data.eventid].keys[i].name;
            var index = gameEventDescriptors[data.eventid].keys[i].type;
            var value = k[Object.keys(k)[index]];
            e[key] = value;
        });
        var ct2 = counts.game_events;
        ct2[data.event_name] = ct2[data.event_name] ? ct2[data.event_name] + 1 : 1;
        if (data.event_name === "dota_combatlog") {
            //console.log(e);
        }
        if (data.event_name === "player_connect") {
            console.log(e);
        }
        //TODO emit events based on the event_name
        //TODO supply some kind of index for users to use as reference for gameevent names
        //they are listed inside individual replays, so we can't just pregenerate one to use
        //console.log(data);
        //throw "test";
        //"dota_combatlog"
        //TODO emit things like combat log here?  combat log entries require the use of stringtables in order to make sense of the numeric entries
        //combat log type is in an enum in the .proto files
    });
    //TODO entities. huffman trees, property decoding?!
    /*
    p.on("*", function(data) {
    });
    */
    p.start = function start(cb) {
        input.on('end', function() {
            stop = true;
            input.removeAllListeners();
            console.log(counts);
            return cb();
        });
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
                var demType = command & ~dota.EDemoCommands.DEM_IsCompressed;
                var isCompressed = (command & dota.EDemoCommands.DEM_IsCompressed) === dota.EDemoCommands.DEM_IsCompressed;
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
                if (isCompressed) {
                    buf = snappy.uncompressSync(buf);
                }
                var dem = {
                    tick: tick,
                    type: demType,
                    size: size,
                    data: buf
                };
                //console.log(dem);
                if (demType in demTypes) {
                    //lookup the name of the protobuf message to decode with
                    var name = demTypes[demType];
                    if (dota[name]) {
                        if (listening(name)) {
                            dem.data = dota[name].decode(dem.data);
                            p.emit("*", dem.data);
                            p.emit(name, dem.data);
                        }
                    }
                    else {
                        console.log("no definition for dem type %s (%s)", demType, typeof demType);
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
        var priorities = {
            "CNETMsg_Tick": -10,
            "CSVCMsg_CreateStringTable": -10,
            "CSVCMsg_UpdateStringTable": -10,
            "CNETMsg_SpawnGroup_Load": -10,
            "CSVCMsg_PacketEntities": 5,
            "CMsgSource1LegacyGameEvent": 10
        };
        //the inner data of a CDemoPacket is raw bits (no longer byte aligned!)
        //convert the buffer object into a bitstream so we can read from it
        //read until less than 8 bits left
        var packets = [];
        var bitStream = new BitStream(data.data);
        while (bitStream.limit - bitStream.offset >= 8) {
            var t = bitStream.readUBitVar();
            var s = bitStream.readVarUInt();
            var d = bitStream.readBuffer(s * 8);
            var pack = {
                type: t,
                size: s,
                data: d
            };
            packets.push(pack);
        }
        //sort the inner packets by priority in order to ensure we parse dependent packets last
        packets.sort(function(a, b) {
            return priorities[packetTypes[a.type]] || 0 - priorities[packetTypes[b.type]] || 0;
        });
        for (var i = 0; i < packets.length; i++) {
            var packet = packets[i];
            var packType = packet.type;
            var t = packetTypes[packType] || packType;
            var ct = counts.packets;
            ct[t] = ct[t] ? ct[t] + 1 : 1;
            if (packType in packetTypes) {
                //lookup the name of the proto message for this packet type
                var name = packetTypes[packType];
                if (dota[name]) {
                    if (listening(name)) {
                        packet.data = dota[name].decode(packet.data);
                        p.emit("*", packet.data);
                        p.emit(name, packet.data);
                    }
                }
                else {
                    console.log("no definition for packet type %s", packType);
                }
            }
        }
    }
    /**
     * Returns whether there is an attached listener for this message name.
     **/
    function listening(name) {
        return p.listeners(name).length || p.listeners("*").length;
    }

    function readCDemoStringTables(data) {
        /*
        //TODO rather than processing when we get this demo message, we want to create when we read the packet CSVCMsg_CreateStringTable?
        for (var i = 0; i < data.tables.length; i++) {
            //console.log(Object.keys(data.tables[i]));
            //console.log(data.tables[i].table_name);
        }
        */
        return;
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
            return cb(null, buf);
        }
        else {
            input.once('readable', function() {
                return readBytes(size, cb);
            });
        }
    }
};
util.inherits(Parser, EventEmitter);
module.exports = Parser;
var counts = {
    packets: {},
    game_events: {}
};
