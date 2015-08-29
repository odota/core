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
var types = require('./types.json');
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
//console.error(Object.keys(dota));
var Parser = function(input) {
    //wrap a passed buffer in a stream
    //TODO this isn't tested yet
    //TODO try webpacking the library
    if (Buffer.isBuffer(input)) {
        var bufferStream = new stream.PassThrough();
        bufferStream.end(input);
        input = bufferStream;
    }
    var stop = false;
    var p = this;
    //expose the gameeventdescriptor, stringtables, types, entities to the user and have the parser update them as it parses
    p.types = types;
    p.game_event_descriptors = {};
    p.string_tables = {
        tables: [],
        byName: {}
    };
    p.entities = {};
    p.start = function start(cb) {
        input.on('end', function() {
            stop = true;
            input.removeAllListeners();
            console.error(counts);
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
    /**
     * Internal listeners to automatically process certain packets.
     * We abstract this away from the user so they don't need to worry about it.
     * For optimal speed we could allow the user to disable these.
     **/
    p.on("CDemoStop", function(data) {
        //don't stop on CDemoStop since some replays have CDemoGameInfo after it
        //stop = true;
    });
    //p.on("CDemoStringTables", readCDemoStringTables);
    p.on("CDemoSignonPacket", readCDemoPacket);
    p.on("CDemoPacket", readCDemoPacket);
    p.on("CDemoFullPacket", function(data) {
        //console.error(data);
        //readCDemoStringTables(data.string_table);
        readCDemoPacket(data.packet);
    });
    //string tables may mutate over the lifetime of the replay.
    //Therefore we listen for create/update events and modify the table as needed.
    p.on("CSVCMsg_CreateStringTable", createStringTable);
    p.on("CSVCMsg_UpdateStringTable", updateStringTable);
    //emitted once, this packet sets up the information we need to read gameevents
    p.on("CMsgSource1LegacyGameEventList", function(data) {
        //console.error(data);
        var gameEventDescriptors = p.game_event_descriptors;
        for (var i = 0; i < data.descriptors.length; i++) {
            gameEventDescriptors[data.descriptors[i].eventid] = data.descriptors[i];
        }
    });
    //TODO entities. huffman trees, property decoding?!  requires parsing CDemoClassInfo, and instancebaseline string table?
    return p;
    /**
     * Reads the next DEM message from the replay (outer message)
     **/
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
                //console.error(dem);
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
                        console.error("no proto definition for dem type %s", demType);
                    }
                }
                else {
                    console.error("no proto name for dem type %s", demType);
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
        var priorities = {
            "CNETMsg_Tick": -10,
            "CSVCMsg_CreateStringTable": -10,
            "CSVCMsg_UpdateStringTable": -10,
            "CNETMsg_SpawnGroup_Load": -10,
            "CSVCMsg_PacketEntities": 5,
            "CMsgSource1LegacyGameEvent": 10
        };
        //the inner data of a CDemoPacket is raw bits (no longer byte aligned!)
        var packets = [];
        //extract the native buffer from the ByteBuffer decoded by protobufjs
        var buf = msg.data.toBuffer();
        //convert the buffer object into a bitstream so we can read bits from it
        var bs = new BitStream(buf);
        //read until less than 8 bits left
        while (bs.limit - bs.offset >= 8) {
            var t = bs.readUBitVar();
            var s = bs.readVarUInt();
            var d = bs.readBuffer(s * 8);
            var pack = {
                type: t,
                size: s,
                data: d,
                position: packets.length
            };
            packets.push(pack);
        }
        //sort the inner packets by priority in order to ensure we parse dependent packets last
        packets.sort(function(a, b) {
            //we must use a stable sort here in order to preserve order of packets when possible (for example, string tables)
            var p1 = priorities[packetTypes[a.type]] || 0;
            var p2 = priorities[packetTypes[b.type]] || 0;
            if (p1 === p2) {
                return a.position - b.position;
            }
            return p1 - p2;
        });
        for (var i = 0; i < packets.length; i++) {
            var packet = packets[i];
            var packType = packet.type;
            //TELEMETRY
            var pt = packetTypes[packType] || packType;
            var ct = counts.packets;
            ct[pt] = ct[pt] ? ct[pt] + 1 : 1;
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
                    console.error("no proto definition for packet name %s", name);
                }
            }
            else {
                console.error("no proto name for packet type %s", packType);
            }
        }
    }

    function createStringTable(data) {
        //create a stringtable
        //console.error(data);
        //extract the native buffer from the string_data ByteBuffer, with the offset removed
        var buf = data.string_data.toBuffer();
        if (data.data_compressed) {
            //decompress the string data with snappy
            //early source 2 replays may use LZSS, we can detect this by reading the first four bytes of buffer
            buf = snappy.uncompressSync(buf);
        }
        //pass the buffer and parse string table data from it
        var items = parseStringTableData(buf, data.num_entries, data.user_data_fixed_size, data.user_data_size);
        //console.error(items);
        //remove the buf and replace with items, which is a decoded version of it
        data.string_data = {};
        // Insert the items into the table as an object
        items.forEach(function(it) {
            data.string_data[it.index] = it;
        });
        /*
        // Apply the updates to baseline state
	    if t.name == "instancebaseline" {
	    	p.updateInstanceBaseline()
	    }
        */
        p.string_tables.byName[data.name] = data;
        p.string_tables.tables.push(data);
    }

    function updateStringTable(data) {
        //update a string table
        //retrieve table by id
        var table = p.string_tables.tables[data.table_id];
        //extract native buffer
        var buf = data.string_data.toBuffer();
        if (table) {
            var items = parseStringTableData(buf, data.num_changed_entries, table.user_data_fixed_size, table.user_data_size);
            var string_data = table.string_data;
            items.forEach(function(it) {
                //console.error(it);
                if (!string_data[it.index]) {
                    //we don't have this item in the string table yet, add it
                    string_data[it.index] = it;
                }
                else {
                    //we're updating an existing item
                    //only update key if the new key is not blank
                    if (it.key) {
                        //console.error("updating key %s->%s at index %s on %s, id %s", string_data[it.index].key, it.key, it.index, table.name, data.table_id);
                        string_data[it.index].key = it.key;
                        //string_data[it.index].key = [].concat(string_data[it.index].key).concat(it.key);
                    }
                    //only update value if the new item has a nonempty value buffer
                    if (it.value.length) {
                        //console.log("updating value length %s->%s at index %s on %s", string_data[it.index].value.length, it.value.length, it.index, table.name);
                        string_data[it.index].value = it.value;
                    }
                }
            });
        }
        else {
            throw "string table doesn't exist!";
        }
        /*
        // Apply the updates to baseline state
	    if t.name == "instancebaseline" {
	    	p.updateInstanceBaseline()
	    }
	    */
    }
    /**
     * Parses a buffer of string table data and returns an array of decoded items
     **/
    function parseStringTableData(buf, num_entries, userDataFixedSize, userDataSize) {
        // Some tables have no data
        if (!buf.length) {
            return [];
        }
        var items = [];
        var bs = new BitStream(buf);
        // Start with an index of -1.
        // If the first item is at index 0 it will use a incr operation.
        var index = -1;
        var STRINGTABLE_KEY_HISTORY_SIZE = 32;
        // Maintain a list of key history
        // each entry is a string
        var keyHistory = [];
        // Loop through entries in the data structure
        // Each entry is a tuple consisting of {index, key, value}
        // Index can either be incremented from the previous position or overwritten with a given entry.
        // Key may be omitted (will be represented here as "")
        // Value may be omitted
        for (var i = 0; i < num_entries; i++) {
            var key = null;
            var value = new Buffer(0);
            // Read a boolean to determine whether the operation is an increment or
            // has a fixed index position. A fixed index position of zero should be
            // the last data in the buffer, and indicates that all data has been read.
            var incr = bs.readBoolean();
            if (incr) {
                index += 1;
            }
            else {
                index = bs.readVarUInt() + 1;
            }
            // Some values have keys, some don't.
            var hasKey = bs.readBoolean();
            if (hasKey) {
                // Some entries use reference a position in the key history for
                // part of the key. If referencing the history, read the position
                // and size from the buffer, then use those to build the string
                // combined with an extra string read (null terminated).
                // Alternatively, just read the string.
                var useHistory = bs.readBoolean();
                if (useHistory) {
                    var pos = bs.readBits(5);
                    var size = bs.readBits(5);
                    if (pos >= keyHistory.length) {
                        //history doesn't have this position, just read
                        key = bs.readNullTerminatedString();
                    }
                    else {
                        //console.log(keyHistory);
                        //console.log("%s in history", s);
                        var s = keyHistory[pos];
                        if (size > s.length) {
                            //our target size is longer than the key stored in history
                            //pad the remaining size with a null terminated string from stream
                            key = (s + bs.readNullTerminatedString());
                        }
                        else {
                            //we only want a piece of the historical string, slice it out and read the null terminator
                            key = s.slice(0, size) + bs.readNullTerminatedString();
                        }
                    }
                }
                else {
                    //don't use the history, just read the string
                    key = bs.readNullTerminatedString();
                }
                keyHistory.push(key);
                if (keyHistory.length > STRINGTABLE_KEY_HISTORY_SIZE) {
                    //drop the oldest key if we hit the cap
                    keyHistory.shift();
                }
            }
            // Some entries have a value.
            var hasValue = bs.readBoolean();
            if (hasValue) {
                // Values can be either fixed size (with a size specified in
                // bits during table creation, or have a variable size with
                // a 14-bit prefixed size.
                if (userDataFixedSize) {
                    value = bs.readBuffer(userDataSize);
                }
                else {
                    var valueSize = bs.readBits(14);
                    //TODO mysterious 3 bits of data?
                    bs.readBits(3);
                    value = bs.readBuffer(valueSize * 8);
                }
            }
            items.push({
                index: index,
                key: key,
                value: value
            });
        }
        //console.error(keyHistory, items, num_entries);
        return items;
    }
    /**
     * Returns whether there is an attached listener for this message name.
     **/
    function listening(name) {
        return p.listeners(name).length || p.listeners("*").length;
    }

    function readCDemoStringTables(data) {
        //rather than processing when we read this demo message, we want to create when we read the packet CSVCMsg_CreateStringTable
        //this packet is just emitted as a state dump at intervals
        return;
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
