/**
 * Converts a given buffer of bytes to a stream of bits and provides methods for reading individual bits (non-aligned reads)
 **/
var Long = require('long');
//accepts a native buffer object
var BitStream = function(buf) {
    this.offset = 0;
    this.limit = buf.length * 8;
    this.bytes = buf;
};
/**
 * Reads the specified number of bits (possibly non-aligned) and returns as 32bit int
 **/
BitStream.prototype.readBits = function(n) {
    if (n > (this.limit - this.offset)) {
        throw "not enough bits left in stream to read!";
    }
    var bitOffset = this.offset % 8;
    var bitsToRead = bitOffset + n;
    var bytesToRead = ~~(bitsToRead / 8);
    //if reading a multiple of 8 bits, read an additional byte
    if (bitsToRead % 8) {
        bytesToRead += 1;
    }
    var value = null;
    if (!bitOffset && n === 8) {
        //if we are byte-aligned and only want one byte, we can read quickly without shifting operations
        value = this.bytes.readUInt8(this.offset / 8);
    }
    //32 bit shifting
    else if (bitsToRead <= 31) {
        value = 0;
        //console.error(bits, this.offset, bitOffset, bitsToRead,bytesToRead);
        for (var i = 0; i < bytesToRead; i++) {
            //extract the byte from the backing buffer
            var m = this.bytes[~~(this.offset / 8) + i];
            //move these 8 bits to the correct location
            //looks like most significant 8 bits come last, so this flips endianness
            value += (m << (i * 8));
        }
        //drop the extra bits, since we started from the beginning of the byte regardless of offset
        value >>= bitOffset;
        //shift a single 1 over, subtract 1 to form a bit mask that removes the first bit
        value &= ((1 << n) - 1);
    }
    else {
        //trying to read 32+ bits with native JS probably won't work because we must then read five bytes from the backing buffer
        //this means in practice we may have difficulty with n >= 25 bits (since offset can be up to 7)
        //can't fit that into a 32 bit int unless we use JS Long, which is slow
        console.error(bitsToRead);
        //64 bit shifting, we only need this if our operations cant fit into 32 bits
        value = new Long();
        //console.error(bits, this.offset, bitOffset, bitsToRead,bytesToRead);
        for (var i = 0; i < bytesToRead; i++) {
            //extract the byte from the backing buffer
            var m64 = this.bytes[~~(this.offset / 8) + i];
            //console.error(m, this.bytes);
            //copy m into a 64bit holder so we can shift bits around more
            m64 = new Long.fromNumber(m64);
            //shift to get the bits we want
            value = value.add(m64.shiftLeft(i * 8));
        }
        value = value.shiftRight(bitOffset);
        //shift a single 1 over, subtract 1 to form a bit mask 
        value = value.and((1 << n) - 1);
        value = value.toInt();
    }
    this.offset += n;
    return value;
};
/**
 * Reads the specified number of bits into a Buffer and returns
 **/
BitStream.prototype.readBuffer = function(bits) {
    var bytes = Math.ceil(bits / 8);
    var result = new Buffer(bytes);
    var offset = 0;
    result.length = bytes;
    while (bits > 0) {
        //read up to 8 bits at a time (we may read less at the end if not aligned)
        var bitsToRead = Math.min(bits, 8);
        result.writeUInt8(this.readBits(bitsToRead), offset);
        offset += 1;
        bits -= bitsToRead;
    }
    return result;
};
BitStream.prototype.readBoolean = function() {
    return this.readBits(1);
};
/**
 * Reads until we reach a null terminator character and returns the result as a string
 **/
BitStream.prototype.readNullTerminatedString = function() {
    var str = "";
    while (true) {
        var byteInt = this.readBits(8);
        if (!byteInt) {
            break;
        }
        var byteBuf = new Buffer(1);
        byteBuf.writeUInt8(byteInt);
        str += byteBuf.toString();
    }
    //console.log(str);
    return str;
};
BitStream.prototype.readVarUInt = function() {
    var max = 32;
    var m = ((max + 6) / 7) * 7;
    var value = 0;
    var shift = 0;
    while (true) {
        var byte = this.readBits(8);
        value |= (byte & 0x7F) << shift;
        shift += 7;
        if ((byte & 0x80) === 0 || shift == m) {
            return value;
        }
    }
};
BitStream.prototype.readUBitVar = function() {
    // Thanks to Robin Dietrich for providing a clean version of this code :-)
    // The header looks like this: [XY00001111222233333333333333333333] where everything > 0 is optional.
    // The first 2 bits (X and Y) tell us how much (if any) to read other than the 6 initial bits:
    // Y set -> read 4
    // X set -> read 8
    // X + Y set -> read 28
    var v = this.readBits(6);
    //bitwise & 0x30 (0b110000) (determines whether the first two bits are set)
    switch (v & 0x30) {
        case 0x10:
            v = (v & 15) | (this.readBits(4) << 4);
            break;
        case 0x20:
            v = (v & 15) | (this.readBits(8) << 4);
            break;
        case 0x30:
            v = (v & 15) | (this.readBits(28) << 4);
            break;
    }
    return v;
};
module.exports = BitStream;