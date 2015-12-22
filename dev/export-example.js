var zlib = require("zlib"),
    JSONStream = require("JSONStream"),
    fs = require("fs");
    
var fileName = "../export/yasp-dump.json.gz";

var write = fs.createReadStream(fileName)
var JSONStream =  JSONStream.parse("*.match_id");

JSONStream.on("data", function(d) {
    console.log(d);
});

write.pipe(zlib.createGunzip()).pipe(JSONStream);

