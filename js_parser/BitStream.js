var ByteBuffer = require('bytebuffer');
var BitStream = function(buf) {
    this.offset = 0;
    this.limit = buf.limit * 8;
    this.byteBuffer = ByteBuffer.wrap(buf);
};
BitStream.BitMask = [0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];
BitStream.prototype.readBits = function(bits) {
    var bitOffset = this.offset % 8;
    var bitsToRead = bitOffset + bits;
    var bytesToRead = bitsToRead / 8;
    if (bitsToRead % 8) {
        bytesToRead += 1;
    }
    var value;
    for (var i=0;i<bytesToRead;i++){
        //extract the byte from the backing bytebuffer
        var m = this.byteBuffer[this.offset/8+i];
        //shift to get the bit we want
        value += m << i*8;
    }
    
    value >>= bitOffset;
    value &= (1 << bits) -1;
    this.offset += bits;
    if (!value) throw "unexpected zero value";
    return value;
    
    /*
    //js implementation
    var value = 0;
    var read = 0;
    var byte;
    var count;
    while (bits > 0) {
        if (this.byteBuffer.offset === this.byteBuffer.limit) {
            byte = 0; // They pad up to 4 byte boundary with 0
        }
        else {
            byte = this.byteBuffer.readUint8(this.byteBuffer.offset);
        }
        count = Math.min(bits, 8 - this.offset);
        value = value | ((byte >> this.offset) & BitStream.BitMask[count]) << read;
        this.offset += count;
        bits -= count;
        read += count;
        if (this.offset == 8) {
            this.offset = 0;
            this.byteBuffer.offset += 1;
        }
    }
    return value;
    */
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
    /*
	//clarity implementation
	//pos is bit offset
	//data is array of 8 bytes (longs?)
    int start = pos >> 6;
    int end = (pos + n - 1) >> 6;
    int s = pos & 63;
    long ret;

    if (start == end) {
        ret = (data[start] >>> s) & MASKS[n];
    } else { // wrap around
        ret = ((data[start] >>> s) | (data[end] << (64 - s))) & MASKS[n];
    }
    pos += n;
    return ret;
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