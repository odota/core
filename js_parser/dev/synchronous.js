//synchronous implementation, requires entire replay to be read into bytebuffer
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