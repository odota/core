//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a parsing library as a npm package that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//library should provide methods for accepting a stream or a file
//return an eventemitter, ee emits events when it parses a certain message
//user listens for events and acts based on the event
//webpack into a browser-compatible version
var ProtoBuf = require('protobufjs');
var path = require('path');
var ByteBuffer = require("bytebuffer");
var BitStream = require('./BitStream');
var snappy = require('snappy');
//emit events for user to handle
//client sets up listeners for each event
//library should return the eventemitter for user to operate on
var EventEmitter = require('events').EventEmitter;
var ee = new EventEmitter();
var async = require('async');
//read the protobufs and build a dota object for reference
var builder = ProtoBuf.newBuilder();
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/base_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/gcsdk_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/dota_gcmessages_client.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/demo.proto'), builder);
var dota = builder.build();
var inStream = process.stdin;
inStream.once('readable', function() {
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
            var stop = false;
            var count = 0;
            async.until(function() {
                return stop;
            }, function(cb) {
                count += 1;
                stop = count > 25;
                readDemoMessage(function(err, msg) {
                    //this is an example of looking up enum string by integer, may be more performant to construct our own map
                    var name = "CDemo" + builder.lookup("EDemoCommands").getChild(msg.typeId).name.slice(4);
                    var demData;
                    if (dota[name]) {
                        demData = dota[name].decode(msg.data);
                        console.log(name);
                    }
                    else {
                        console.log('no protobuf definition for %s', name);
                    }
                    //TODO more efficient to have user specify the events they care about first, so we can selectively emit events?
                    //TODO emit an "Any" event that fires on any demo message?  do one for packets as well?
                    ee.emit(name, demData);
                    switch (msg.typeId) {
                        case -1:
                            //DEM_Error = -1;
                            err = msg;
                            break;
                        case 0:
                            //DEM_Stop = 0;
                            //TODO handle replays that don't have a CDemoStop?  stop on eof
                            stop = true;
                            break;
                        case 1:
                            //DEM_FileHeader = 1;
                            break;
                        case 2:
                            //DEM_FileInfo = 2;
                            break;
                        case 3:
                            //DEM_SyncTick = 3;
                            break;
                        case 4:
                            //DEM_SendTables = 4;
                            //TODO construct sendtables?  does source2 use this?
                            break;
                        case 5:
                            //DEM_ClassInfo = 5;
                            break;
                        case 6:
                            //DEM_StringTables = 6;
                            //TODO need to construct stringtables to look up things like combat log names
                            break;
                        case 7:
                            //DEM_Packet = 7;
                            /*
                            message CDemoPacket {
                            	optional int32 sequence_in = 1;
                            	optional int32 sequence_out_ack = 2;
                            	optional bytes data = 3;
                            }
                            */
                            console.log(demData);
                            readCDemoPacket(demData);
                            //TODO reading entities, where are they stored?
                            //TODO maintain a mapping for PacketTypes of id to string so we can emit events for different packet types
                            break;
                        case 8:
                            //DEM_SignonPacket = 8;
                            break;
                        case 9:
                            //DEM_ConsoleCmd = 9;
                            break;
                        case 10:
                            //DEM_CustomData = 10;
                            break;
                        case 11:
                            //DEM_CustomDataCallbacks = 11;
                            break;
                        case 12:
                            //DEM_UserCmd = 12;
                            break;
                        case 13:
                            //DEM_FullPacket = 13;
                            /*
                            message CDemoFullPacket {
                            	optional CDemoStringTables string_table = 1;
                            	optional CDemoPacket packet = 2;
                            }
                            */
                            //TODO this appears to be a packet with a string table attached?
                            //use case 6 to process the stringtable
                            //use case 7 to process the packet
                            break;
                        case 14:
                            //DEM_SaveGame = 14;
                            break;
                        case 15:
                            //DEM_SpawnGroups = 15;
                            break;
                        case 16:
                            //DEM_Max = 16;
                            break;
                        default:
                            err = "Unknown DEM type!";
                    }
                    return cb(err);
                });
            }, function(err) {
                //done processing demo messages, or an error occurred
                return cb(err);
            });
        }
    }, function(err) {
        if (err) {
            throw err;
        }
    });
});
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
                isCompressed: msgCompressed,
                data: buf
            };
            return cb(err, msg);
        });
    });
}
// Internal parser for callback OnCDemoPacket, responsible for extracting
// multiple inner packets from a single CDemoPacket. This is the main structure
// that contains all other data types in the demo file.
function readCDemoPacket(demData) {
    // Read all messages from the buffer. Messages are packed serially as
    // {type, size, data}. We keep reading until until less than a byte remains.
    /*
        for r.remBytes() > 0 {
            t: = int32(r.readUBitVar())
            size: = int(r.readVarUint32())
            buf: = r.readBytes(size)
            ms = append(ms, & pendingMessage {
                p.Tick, t, buf
            })
        }
        // Sort messages to ensure dependencies are met. For example, we need to
        // process string tables before game events that may reference them.
        sort.Sort(ms)
        // Dispatch messages in order.
        for _,
        m: = range ms {
            // Skip message we don't have a definition for (yet)
            // XXX TODO: remove this when we get updated protos.
            if m.t == 400 {
                    continue
                }
                // Call each packet, panic if we encounter an error.
                // XXX TODO: this should return the error up the chain. Panic for debugging.
            if err: = p.CallByPacketType(m.t, m.buf);
            err != nil {
                panic(err)
            }
        }
        return nil
        */
    //the inner data of a CDemoPacket is raw bits (no longer byte aligned!)
    //convert the buffer into a bitstream so we can read from it
    //read until less than 8 bits left
    var bitStream = new BitStream(demData.data);
    console.log(bitStream.offset, bitStream.limit);
    while (bitStream.limit - bitStream.offset > 8) {
        var kind = bitStream.readUBitVarPacketType();
        var size = bitStream.readVarUInt();
        var bytes = bitStream.readBuffer(size * 8);
        console.log(kind, size, bytes);
    }

    function readUserMessage(msg) {
        var kind = msg.msg_type;
        var data = msg.msg_data.clone();
        if (!(kind in this.userMessageIgnore)) {
            if (kind in dota.msg.UserMessages) {
                var userMsg = DotaDemo.pbMessages.build(dota.msg.UserMessages[kind]);
                var decoded = userMsg.decode(data);
                console.log({
                    type: dota.msg.UserMessages[kind],
                    message: decoded
                });
                for (var listener in this.userMessageListeners[kind]) {
                    this.userMessageListeners[kind][listener](decoded);
                }
            }
            else {
                console.log({
                    type: "Unknown UserMessage " + kind
                });
            }
        }
    };
    return;
}

function readDemoStringTables(msg) {
    for (var i = 0; i < msg.tables.length; ++i) {
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
    }
    console.log(msg.tables);
};

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
        //TODO this will wait forever if the replay terminates abruptly
        inStream.once('readable', function() {
            return readBytes(size, cb);
        });
    }
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
/*
// Read bits of a given length as a uint, may or may not be byte-aligned.
function readBits(buf, n) {
	if r.remBits() < n {
		_panicf("read overflow: %d bits requested, only %d remaining", n, r.remBits())
	}

	if n > 32 {
		_panicf("invalid read: %d is greater than maximum read of 32 bits", n)
	}

	bitOffset := r.pos % 8
	nBitsToRead := bitOffset + n
	nBytesToRead := nBitsToRead / 8
	if nBitsToRead%8 != 0 {
		nBytesToRead += 1
	}

	var val uint64
	for i := 0; i < nBytesToRead; i++ {
		m := r.buf[(r.pos/8)+i]
		val += (uint64(m) << uint32(i*8))
	}
	val >>= uint32(bitOffset)
	val &= ((1 << uint32(n)) - 1)
	r.pos += n

	return uint32(val)
}
*/
//synchronous implementation, requires entire replay to be read into bytebuffer
/*
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
    var header = readStringSync(8);
    console.log("header: %s", header);
    if (header.toString() !== "PBDEMS2\0") {
        throw "invalid header";
    }
    //next 8 bytes: appear to be two int32s related to the size of the demo file
    var size1 = readUint32Sync();
    var size2 = readUint32Sync();
    console.log(size1, size2);
    var stop = false;
    var count = 0;
    //next bytes are messages that need to be decoded
    //read until stream is drained or stop on OnCDemoStop
    while (!stop) {
        var msg = readDemoMessageSync();
        count += 1;
        stop = count > 1000;
    }
});

function readDemoMessageSync() {
    // Read a command header, which includes both the message type
    // well as a flag to determine whether or not whether or not the
    // message is compressed with snappy.
    //command: = dota.EDemoCommands(p.reader.readVarUint32())
    var command = readVarint32Sync();
    var tick = readVarint32Sync();
    var size = readVarint32Sync();
    var buf = readBytesSync(size);
    console.log(command, tick, size);
    // Extract the type and compressed flag out of the command
    //msgType: = int32(command & ^ dota.EDemoCommands_DEM_IsCompressed)
    //msgCompressed: = (command & dota.EDemoCommands_DEM_IsCompressed) == dota.EDemoCommands_DEM_IsCompressed
    var msgType = command & ~dota.EDemoCommands.DEM_IsCompressed;
    var msgCompressed = (command & dota.EDemoCommands.DEM_IsCompressed) === dota.EDemoCommands.DEM_IsCompressed;
    // Read the tick that the message corresponds with.
    // tick: = p.reader.readVarUint32()
    // This appears to actually be an int32, where a -1 means pre-game.
    if (tick === 4294967295) {
        tick = 0;
    }
    // Read the size and following buffer.
    // If the buffer is compressed, decompress it with snappy.
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
    console.log(msg);
    return msg;
}

function readVarint32Sync() {
    return bb.readVarint32();
}

function readStringSync(size) {
    return bb.readString(size);
}

function readUint32Sync() {
    return bb.readUint32();
}

function readByteSync() {
    return bb.readByte();
}

function readBytesSync(size) {
    var buf = bb.slice(bb.offset, bb.offset + size).toBuffer();
    bb.offset += size;
    return buf;
}
*/