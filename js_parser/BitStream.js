var ByteBuffer = require('bytebuffer');
var Long = require('long');
var BitStream = function(buf) {
    this.offset = buf.offset * 8;
    this.limit = buf.limit * 8;
    this.bytes = buf.buffer;
};
BitStream.BitMask = [0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];
BitStream.prototype.readBits = function(bits) {
    var bitOffset = this.offset % 8;
    var bitsToRead = bitOffset + bits;
    //coerce division to integer
    var bytesToRead = ~~(bitsToRead / 8);
    if (bitsToRead % 8) {
        bytesToRead += 1;
    }
    //console.log(bits, this.offset, bitOffset, bitsToRead,bytesToRead);
    var value = new Long();
    for (var i = 0; i < bytesToRead; i++) {
        //extract the byte from the backing bytebuffer
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
    this.offset += bits;
    //console.log(value);
    return value.toInt();
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
BitStream.prototype.readBuffer = function(bits) {
    var bytes = Math.ceil(bits / 8);
    var result = new ByteBuffer(bytes);
    result.length = bytes;
    while (bits > 0) {
        var read = Math.min(bits, 8);
        result.writeUint8(this.readBits(read));
        bits -= read;
    }
    result.offset = 0;
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
BitStream.prototype.readUBitVarPacketType = function readUBitVarPacketType(bs) {
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