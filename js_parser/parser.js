console.time('parse');
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
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/usermessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, './proto/gameevents.proto'), builder);
var dota = builder.build();
console.log(Object.keys(dota));
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
                //stop = count > 1000;
                readDemoMessage(function(err, msg) {
                    //this is an example of looking up enum string by integer, may be more performant to construct our own map
                    var name = "CDemo" + builder.lookup("EDemoCommands").getChild(msg.typeId).name.slice(4);
                    var demData;
                    if (dota[name]) {
                        demData = dota[name].decode(msg.data);
                        //console.log(name);
                    }
                    else {
                        //console.log('no protobuf definition for %s', name);
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
                            readCDemoPacket(demData);
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
        console.timeEnd('parse');
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
    //convert the buffer object into a bitstream so we can read from it
    //read until less than 8 bits left
    var bitStream = new BitStream(demData.data);
    while (bitStream.limit - bitStream.offset > 8) {
        var type = bitStream.readUBitVarPacketType();
        var size = bitStream.readVarUInt();
        var bytes = bitStream.readBuffer(size * 8);
        //console.log(kind, size, bytes);
        if (type in packetTypes) {
            //lookup the name of the proto message for this packet type
            //use correct protobuf to decode
            var protoName = null;
            if (type === 118) {
                protoName = "CUserMessageSayText2";
            }
            if (type === 205) {
                //protoName = "CMsgSource1LegacyGameEventList";
            }
            if (type === 207) {
                //protoName = "CMsgSource1LegacyGameEvent";
            }
            if (protoName) {
                try {
                    var decoded = dota[protoName].decode(bytes);
                    console.log(decoded);
                }
                catch (e) {
                    console.log(e);
                }
            }
        }
        //TODO reading entities, where are they stored?
        //TODO push the packets of this message into an array and sort them by priority
    }
    /*
    var hrTime = process.hrtime();
    var start = hrTime[0] * 1000000000 + hrTime[1];
    hrTime = process.hrtime();
    var end = hrTime[0] * 1000000000 + hrTime[1];
    sum += (end - start)/1000000000;
    console.log(sum);
    */
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
//TODO maintain a mapping for PacketTypes of id to string so we can emit events for different packet types.  we'll probably want to generate them automatically from the protobufs
//TODO translate this intermediate name into a protobuf message name?
var packetTypes = {
        0: "NET_Messages_net_NOP",
        1: "NET_Messages_net_Disconnect",
        3: "NET_Messages_net_SplitScreenUser",
        4: "NET_Messages_net_Tick",
        5: "NET_Messages_net_StringCmd",
        6: "NET_Messages_net_SetConVar",
        7: "NET_Messages_net_SignonState",
        8: "NET_Messages_net_SpawnGroup_Load",
        9: "NET_Messages_net_SpawnGroup_ManifestUpdate",
        11: "NET_Messages_net_SpawnGroup_SetCreationTick",
        12: "NET_Messages_net_SpawnGroup_Unload",
        13: "NET_Messages_net_SpawnGroup_LoadCompleted",
        40: "SVC_Messages_svc_ServerInfo",
        41: "SVC_Messages_svc_FlattenedSerializer",
        42: "SVC_Messages_svc_ClassInfo",
        43: "SVC_Messages_svc_SetPause",
        44: "SVC_Messages_svc_CreateStringTable",
        45: "SVC_Messages_svc_UpdateStringTable",
        46: "SVC_Messages_svc_VoiceInit",
        47: "SVC_Messages_svc_VoiceData",
        48: "SVC_Messages_svc_Print",
        49: "SVC_Messages_svc_Sounds",
        50: "SVC_Messages_svc_SetView",
        51: "SVC_Messages_svc_ClearAllStringTables",
        52: "SVC_Messages_svc_CmdKeyValues",
        53: "SVC_Messages_svc_BSPDecal",
        54: "SVC_Messages_svc_SplitScreen",
        55: "SVC_Messages_svc_PacketEntities",
        56: "SVC_Messages_svc_Prefetch",
        57: "SVC_Messages_svc_Menu",
        58: "SVC_Messages_svc_GetCvarValue",
        59: "SVC_Messages_svc_StopSound",
        60: "SVC_Messages_svc_PeerList",
        61: "SVC_Messages_svc_PacketReliable",
        62: "SVC_Messages_svc_UserMessage",
        63: "SVC_Messages_svc_SendTable",
        67: "SVC_Messages_svc_GameEvent",
        68: "SVC_Messages_svc_TempEntities",
        69: "SVC_Messages_svc_GameEventList",
        70: "SVC_Messages_svc_FullFrameSplit",
        101: "EBaseUserMessages_UM_AchievementEvent",
        102: "EBaseUserMessages_UM_CloseCaption",
        103: "EBaseUserMessages_UM_CloseCaptionDirect",
        104: "EBaseUserMessages_UM_CurrentTimescale",
        105: "EBaseUserMessages_UM_DesiredTimescale",
        106: "EBaseUserMessages_UM_Fade",
        107: "EBaseUserMessages_UM_GameTitle",
        109: "EBaseUserMessages_UM_HintText",
        110: "EBaseUserMessages_UM_HudMsg",
        111: "EBaseUserMessages_UM_HudText",
        112: "EBaseUserMessages_UM_KeyHintText",
        113: "EBaseUserMessages_UM_ColoredText",
        114: "EBaseUserMessages_UM_RequestState",
        115: "EBaseUserMessages_UM_ResetHUD",
        116: "EBaseUserMessages_UM_Rumble",
        117: "EBaseUserMessages_UM_SayText",
        118: "EBaseUserMessages_UM_SayText2",
        119: "EBaseUserMessages_UM_SayTextChannel",
        120: "EBaseUserMessages_UM_Shake",
        121: "EBaseUserMessages_UM_ShakeDir",
        124: "EBaseUserMessages_UM_TextMsg",
        125: "EBaseUserMessages_UM_ScreenTilt",
        126: "EBaseUserMessages_UM_Train",
        127: "EBaseUserMessages_UM_VGUIMenu",
        128: "EBaseUserMessages_UM_VoiceMask",
        129: "EBaseUserMessages_UM_VoiceSubtitle",
        130: "EBaseUserMessages_UM_SendAudio",
        131: "EBaseUserMessages_UM_ItemPickup",
        132: "EBaseUserMessages_UM_AmmoDenied",
        133: "EBaseUserMessages_UM_CrosshairAngle",
        134: "EBaseUserMessages_UM_ShowMenu",
        135: "EBaseUserMessages_UM_CreditsMsg",
        136: "EBaseEntityMessages_EM_PlayJingle",
        137: "EBaseEntityMessages_EM_ScreenOverlay",
        138: "EBaseEntityMessages_EM_RemoveAllDecals",
        139: "EBaseEntityMessages_EM_PropagateForce",
        140: "EBaseEntityMessages_EM_DoSpark",
        141: "EBaseEntityMessages_EM_FixAngle",
        142: "EBaseUserMessages_UM_CloseCaptionPlaceholder",
        143: "EBaseUserMessages_UM_CameraTransition",
        144: "EBaseUserMessages_UM_AudioParameter",
        145: "EBaseUserMessages_UM_ParticleManager",
        146: "EBaseUserMessages_UM_HudError",
        147: "EBaseUserMessages_UM_CustomGameEvent_ClientToServer",
        148: "EBaseUserMessages_UM_CustomGameEvent_ServerToClient",
        149: "EBaseUserMessages_UM_TrackedControllerInput_ClientToServer",
        200: "EBaseGameEvents_GE_VDebugGameSessionIDEvent",
        201: "EBaseGameEvents_GE_PlaceDecalEvent",
        202: "EBaseGameEvents_GE_ClearWorldDecalsEvent",
        203: "EBaseGameEvents_GE_ClearEntityDecalsEvent",
        204: "EBaseGameEvents_GE_ClearDecalsForSkeletonInstanceEvent",
        205: "EBaseGameEvents_GE_Source1LegacyGameEventList",
        206: "EBaseGameEvents_GE_Source1LegacyListenEvents",
        207: "EBaseGameEvents_GE_Source1LegacyGameEvent",
        208: "EBaseGameEvents_GE_SosStartSoundEvent",
        209: "EBaseGameEvents_GE_SosStopSoundEvent",
        210: "EBaseGameEvents_GE_SosSetSoundEventParams",
        211: "EBaseGameEvents_GE_SosSetLibraryStackFields",
        212: "EBaseGameEvents_GE_SosStopSoundEventHash",
        465: "EDotaUserMessages_DOTA_UM_AIDebugLine",
        466: "EDotaUserMessages_DOTA_UM_ChatEvent",
        467: "EDotaUserMessages_DOTA_UM_CombatHeroPositions",
        470: "EDotaUserMessages_DOTA_UM_CombatLogShowDeath",
        471: "EDotaUserMessages_DOTA_UM_CreateLinearProjectile",
        472: "EDotaUserMessages_DOTA_UM_DestroyLinearProjectile",
        473: "EDotaUserMessages_DOTA_UM_DodgeTrackingProjectiles",
        474: "EDotaUserMessages_DOTA_UM_GlobalLightColor",
        475: "EDotaUserMessages_DOTA_UM_GlobalLightDirection",
        476: "EDotaUserMessages_DOTA_UM_InvalidCommand",
        477: "EDotaUserMessages_DOTA_UM_LocationPing",
        478: "EDotaUserMessages_DOTA_UM_MapLine",
        479: "EDotaUserMessages_DOTA_UM_MiniKillCamInfo",
        480: "EDotaUserMessages_DOTA_UM_MinimapDebugPoint",
        481: "EDotaUserMessages_DOTA_UM_MinimapEvent",
        482: "EDotaUserMessages_DOTA_UM_NevermoreRequiem",
        483: "EDotaUserMessages_DOTA_UM_OverheadEvent",
        484: "EDotaUserMessages_DOTA_UM_SetNextAutobuyItem",
        485: "EDotaUserMessages_DOTA_UM_SharedCooldown",
        486: "EDotaUserMessages_DOTA_UM_SpectatorPlayerClick",
        487: "EDotaUserMessages_DOTA_UM_TutorialTipInfo",
        488: "EDotaUserMessages_DOTA_UM_UnitEvent",
        489: "EDotaUserMessages_DOTA_UM_ParticleManager",
        490: "EDotaUserMessages_DOTA_UM_BotChat",
        491: "EDotaUserMessages_DOTA_UM_HudError",
        492: "EDotaUserMessages_DOTA_UM_ItemPurchased",
        493: "EDotaUserMessages_DOTA_UM_Ping",
        494: "EDotaUserMessages_DOTA_UM_ItemFound",
        496: "EDotaUserMessages_DOTA_UM_SwapVerify",
        497: "EDotaUserMessages_DOTA_UM_WorldLine",
        499: "EDotaUserMessages_DOTA_UM_ItemAlert",
        500: "EDotaUserMessages_DOTA_UM_HalloweenDrops",
        501: "EDotaUserMessages_DOTA_UM_ChatWheel",
        502: "EDotaUserMessages_DOTA_UM_ReceivedXmasGift",
        503: "EDotaUserMessages_DOTA_UM_UpdateSharedContent",
        504: "EDotaUserMessages_DOTA_UM_TutorialRequestExp",
        505: "EDotaUserMessages_DOTA_UM_TutorialPingMinimap",
        506: "EDotaUserMessages_DOTA_UM_GamerulesStateChanged",
        507: "EDotaUserMessages_DOTA_UM_ShowSurvey",
        508: "EDotaUserMessages_DOTA_UM_TutorialFade",
        509: "EDotaUserMessages_DOTA_UM_AddQuestLogEntry",
        510: "EDotaUserMessages_DOTA_UM_SendStatPopup",
        511: "EDotaUserMessages_DOTA_UM_TutorialFinish",
        512: "EDotaUserMessages_DOTA_UM_SendRoshanPopup",
        513: "EDotaUserMessages_DOTA_UM_SendGenericToolTip",
        514: "EDotaUserMessages_DOTA_UM_SendFinalGold",
        515: "EDotaUserMessages_DOTA_UM_CustomMsg",
        516: "EDotaUserMessages_DOTA_UM_CoachHUDPing",
        517: "EDotaUserMessages_DOTA_UM_ClientLoadGridNav",
        518: "EDotaUserMessages_DOTA_UM_TE_Projectile",
        519: "EDotaUserMessages_DOTA_UM_TE_ProjectileLoc",
        520: "EDotaUserMessages_DOTA_UM_TE_DotaBloodImpact",
        521: "EDotaUserMessages_DOTA_UM_TE_UnitAnimation",
        522: "EDotaUserMessages_DOTA_UM_TE_UnitAnimationEnd",
        523: "EDotaUserMessages_DOTA_UM_AbilityPing",
        524: "EDotaUserMessages_DOTA_UM_ShowGenericPopup",
        525: "EDotaUserMessages_DOTA_UM_VoteStart",
        526: "EDotaUserMessages_DOTA_UM_VoteUpdate",
        527: "EDotaUserMessages_DOTA_UM_VoteEnd",
        528: "EDotaUserMessages_DOTA_UM_BoosterState",
        529: "EDotaUserMessages_DOTA_UM_WillPurchaseAlert",
        530: "EDotaUserMessages_DOTA_UM_TutorialMinimapPosition",
        531: "EDotaUserMessages_DOTA_UM_PlayerMMR",
        532: "EDotaUserMessages_DOTA_UM_AbilitySteal",
        533: "EDotaUserMessages_DOTA_UM_CourierKilledAlert",
        534: "EDotaUserMessages_DOTA_UM_EnemyItemAlert",
        535: "EDotaUserMessages_DOTA_UM_StatsMatchDetails",
        536: "EDotaUserMessages_DOTA_UM_MiniTaunt",
        537: "EDotaUserMessages_DOTA_UM_BuyBackStateAlert",
        538: "EDotaUserMessages_DOTA_UM_SpeechBubble",
        539: "EDotaUserMessages_DOTA_UM_CustomHeaderMessage",
        540: "EDotaUserMessages_DOTA_UM_QuickBuyAlert",
        541: "EDotaUserMessages_DOTA_UM_StatsHeroDetails",
        542: "EDotaUserMessages_DOTA_UM_PredictionResult",
        543: "EDotaUserMessages_DOTA_UM_ModifierAlert",
        544: "EDotaUserMessages_DOTA_UM_HPManaAlert",
        545: "EDotaUserMessages_DOTA_UM_GlyphAlert",
        546: "EDotaUserMessages_DOTA_UM_BeastChat",
        547: "EDotaUserMessages_DOTA_UM_SpectatorPlayerUnitOrders",
        548: "EDotaUserMessages_DOTA_UM_CustomHudElement_Create",
        549: "EDotaUserMessages_DOTA_UM_CustomHudElement_Modify",
        550: "EDotaUserMessages_DOTA_UM_CustomHudElement_Destroy",
        551: "EDotaUserMessages_DOTA_UM_CompendiumState",
        552: "EDotaUserMessages_DOTA_UM_ProjectionAbility"
    }
    //profiling data
var sum = 0;