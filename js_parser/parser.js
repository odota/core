//this script reads from stdin and outputs JSON objects to stdout
//optimally, we release a parsing library as a npm package that can be used server-side and for parsing in the browser
//the server side version should be run using node parser.js in order to allow parallelizing
//library should provide methods for accepting a stream or a file
//parser emits events when it parses a certain message
//user listens for events and acts based on the event
//use node events module
//webpack into a browser-compatible version
//-
//read .proto files with protobufjs, create an object to look up things like EDemoCommands?
var ProtoBuf = require('protobufjs');
var path = require('path');
//https://github.com/dcodeIO/ByteBuffer.js, read types out of binary data
var ByteBuffer = require("bytebuffer");
//decompress with snappy
var snappy = require('snappy');
//emit events with events
var events = require('events');
var async = require('async');
//-
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
        var stop = false;
        var count = 0;
        async.whilst(function() {
            return !stop;
        }, function(cb) {
            count += 1;
            stop = count > 10;
            readDemoMessage(function(err, msg) {
                console.log(err, msg);
                //TODO do things with the outer message
                //TODO a separate mapping for PacketTypes
                //TODO need to construct stringtables
                //TODO need to construct sendtables
                //TODO need to read entities
                //TODO need to reverse mapping of id to string in order to use the correct protobuf decoder (dota.UserMessages.CUserMsg.decode(buf)]")
                //example of looking up enum string by integer
                //may be more performant to construct our own map
                //console.log(builder.lookup("EDemoCommands").getChild(msgType).name);
                //stop on cdemostop
                //for each outer message, call a function from the string name of the typeId, and decode the buf based on protos
                //DEM_Error = -1;
                //DEM_Stop = 0;
                //DEM_FileHeader = 1;
                //DEM_FileInfo = 2;
                //DEM_SyncTick = 3;
                //DEM_SendTables = 4;
                //DEM_ClassInfo = 5;
                //DEM_StringTables = 6;
                //DEM_Packet = 7;
                //DEM_SignonPacket = 8;
                //DEM_ConsoleCmd = 9;
                //DEM_CustomData = 10;
                //DEM_CustomDataCallbacks = 11;
                //DEM_UserCmd = 12;
                //DEM_FullPacket = 13;
                //DEM_SaveGame = 14;
                //DEM_Max = 15;
                switch (msg.typeId) {
                    case -1:
                        break;
                    case 0:
                        break;
                    case 1:
                        break;
                    case 2:
                        break;
                    case 3:
                        break;
                    case 4:
                        break;
                    case 5:
                        break;
                    case 6:
                        break;
                    case 7:
                        break;
                    case 8:
                        break;
                    case 9:
                        break;
                    case 10:
                        break;
                    case 11:
                        break;
                    case 12:
                        break;
                    case 13:
                        break;
                    case 14:
                        break;
                    case 15:
                        break;
                    default:
                        throw "Unknown DEM type!";
                }
                return cb(err);
            });
        }, function(err) {
            console.log(err);
            console.log('done parsing replay!');
        });
    });
});
// Read the next DEM message from the replay (outer message)
function readDemoMessage(cb) {
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
            return cb(err, msg);
        });
    });
}

function readGameMessage(byteBuffer) {
    var kind = byteBuffer.readVarint32();
    var size = byteBuffer.readVarint32();
    if (!(kind in this.gameMessageIgnore)) {
        if (kind in dota.msg.GameMessages) {
            var msg = DotaDemo.pbMessages.build(dota.msg.GameMessages[kind]);
            var buf = byteBuffer.slice(byteBuffer.offset, byteBuffer.offset + size);
            var decoded = msg.decode(buf);
            console.log({
                type: dota.msg.GameMessages[kind],
                message: decoded
            });
            if (kind in this.gameMessageListeners) {
                for (var listener in this.gameMessageListeners[kind]) {
                    this.gameMessageListeners[kind][listener](decoded);
                }
            }
        }
        else {
            console.log({
                type: "Unknown GameMessage " + kind
            });
        }
    }
    byteBuffer.offset += size;
};

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
/*
function readGameSendTable(msg) {
    if (!this.netTables) {
        this.netTables = {};
    }
    this.netTables[msg.net_table_name] = {
        net_name: msg.net_table_name,
        needs_decoder: msg.needs_decoder,
        props: msg.props
    };
    var props = this.netTables[msg.net_table_name].props;
    for (var i = 0; i < props.length; ++i) {
        var prop = props[i];
        if (prop.type === dota.prop.Type.Array_) {
            prop.template = props[i - 1];
        }
    }
};
*/
function readGameCreateStringTable(msg) {
    if (!this.stringTables) {
        this.stringTables = {};
        this.stringTablesID = [];
    }
    var table = new dota.StringTable(msg);
    table.readStream(msg.num_entries, new BitStream(msg.string_data));
    this.stringTables[msg.name] = table;
    this.stringTablesID.push(msg.name);
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
                                        throw "malformed varint detected";
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

//synchronous implementation
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