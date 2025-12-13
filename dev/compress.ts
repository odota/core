import fs from "node:fs";
import {
  gzipSync,
  gunzipSync,
  zstdCompressSync,
  zstdDecompressSync,
} from "node:zlib";

const file = fs.readFileSync("./json/b2_download_file_by_id");

console.time("gz compress");
const gz = gzipSync(file);
console.timeEnd("gz compress");
console.log("original: %s, gz: %s", file.length, gz.length);

console.time("zstd compress");
const zstd = zstdCompressSync(file);
console.timeEnd("zstd compress");
console.log("original: %s, zstd: %s", file.length, zstd.length);

console.time("gz decompress");
const orig = gunzipSync(gz);
console.timeEnd("gz decompress");

console.time("zstd decompress");
const orig2 = zstdDecompressSync(zstd);
console.timeEnd("zstd decompress");
