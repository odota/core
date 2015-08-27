/**
 * Provides methods for dealing with individual bits in a given buffer (non-aligned reads)
 **/
var Long = require('long');
var BitStream = function(buf) {
    this.offset = buf.offset * 8;
    this.limit = buf.limit * 8;
    this.bytes = buf.buffer;
};
/**
 * Reads the specified number of bits (possibly non-aligned) and returns as 32bit int
 **/
BitStream.prototype.readBits = function(bits) {
    var bitOffset = this.offset % 8;
    var value = null;
    if (!bitOffset && bits === 8) {
        //if we are byte-aligned, we can read quickly without shifting operations
        value = this.bytes[this.offset / 8];
    }
    //32 bit shifting
    else {
        value = 0;
        var bitsToRead = bitOffset + bits;
        //coerce division to integer
        var bytesToRead = ~~(bitsToRead / 8);
        if (bitsToRead % 8) {
            bytesToRead += 1;
        }
        //console.log(bits, this.offset, bitOffset, bitsToRead,bytesToRead);
        for (var i = 0; i < bytesToRead; i++) {
            //extract the byte from the backing buffer
            var m = this.bytes[~~(this.offset / 8) + i];
            //console.log(m, this.bytes);
            //shift to get the bits we want
            value += m << (i * 8);
        }
        value >>= (bitOffset);
        //shift a single 1 over, subtract 1 to form a bit mask 
        value &= ((1 << bits) - 1);
    }
    /*
    //64 bit shifting, do we need this?
    else {
        value = new Long();
        var bitsToRead = bitOffset + bits;
        //coerce division to integer
        var bytesToRead = ~~(bitsToRead / 8);
        if (bitsToRead % 8) {
            bytesToRead += 1;
        }
        //console.log(bits, this.offset, bitOffset, bitsToRead,bytesToRead);
        for (var i = 0; i < bytesToRead; i++) {
            //extract the byte from the backing buffer
            var m = this.bytes[~~(this.offset / 8) + i];
            //console.log(m, this.bytes);
            //copy m into a 64bit holder so we can shift bits around more
            m = new Long.fromNumber(m);
            //shift to get the bits we want
            value = value.add(m.shiftLeft(i * 8));
        }
        value = value.shiftRight(bitOffset);
        //shift a single 1 over, subtract 1 to form a bit mask 
        value = value.and((1 << bits) - 1);
        value = value.toInt();
    }
    */
    this.offset += bits;
    return value;
    /*
    //manta implementation
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
	*/
};
/**
 * Reads the specified number of bits into a Buffer and returns
 **/
BitStream.prototype.readBuffer = function(bits) {
    var bytes = Math.ceil(bits / 8);
    //use native buffer for faster speed
    var result = new Buffer(bytes);
    var offset = 0;
    result.length = bytes;
    while (bits > 0) {
        //read up to 8 bits at a time (we may read less at the end if unaligned)
        var bitsToRead = Math.min(bits, 8);
        //skip validation for more speed
        result.writeUInt8(this.readBits(bitsToRead), offset, true);
        offset++;
        bits -= bitsToRead;
    }
    return result;
};
BitStream.prototype.readVarUInt = function() {
    var max = 32;
    var m = ((max + 6) / 7) * 7;
    var value = 0;
    var byte = 0;
    var shift = 0;
    while (true) {
        byte = this.readBits(8);
        value |= (byte & 0x7F) << shift;
        shift += 7;
        if ((byte & 0x80) === 0 || shift == m) {
            return value;
        }
    }
};
BitStream.prototype.readUBitVarPacketType = function() {
    // Thanks to Robin Dietrich for providing a clean version of this code :-)
    // The header looks like this: [XY00001111222233333333333333333333] where everything > 0 is optional.
    // The first 2 bits (X and Y) tell us how much (if any) to read other than the 6 initial bits:
    // Y set -> read 4
    // X set -> read 8
    // X + Y set -> read 28
    var v = this.readBits(6);
    switch (v & 48) {
        case 16:
            v = (v & 15) | (this.readBits(4) << 4);
            break;
        case 32:
            v = (v & 15) | (this.readBits(8) << 4);
            break;
        case 48:
            v = (v & 15) | (this.readBits(28) << 4);
            break;
    }
    return v;
};
module.exports = BitStream;