var db = require("../db"),
    fs = require("fs"),
    zlib = require("zlib"),
    moment = require("moment"),
    JSONStream = require("JSONStream");
    
var fileName = "./export/yasp-dump-" + moment().format("YYYY-MM-DD") + ".json.gz";

try {
    var stat = fs.statSync(fileName);
    
    if (stat.isFile()) {
        console.log("Export file already exists");
        process.exit(1);
    }
} catch (e) {
    console.log(e);
}

var count = 0,
    max = 500000,
    jsstream = JSONStream.stringify(),
    gzip = zlib.createGzip(),
    write = fs.createWriteStream(fileName);
  
jsstream.pipe(gzip).pipe(write);

var stream = db.select("*").from("matches").where("version", ">", 0).orderBy("match_id", "desc").stream();

stream.on("data", function(match){
    stream.pause()
    db.select().from('player_matches').where({
        "player_matches.match_id": Number(match.match_id)
    }).orderBy("player_slot", "asc").asCallback(function(err, players) {
        if (err) {
            console.log(err);
            stream.resume();
            return;
        }
        
        count++;
        delete match.pgroup;
        delete match.url;
        players.forEach(function(p) {
            delete p.match_id;
        })
        
        match.players = players;

        jsstream.write(match);
        stream.resume();

        if (count % 10000 === 0) {
            console.log("Exported %s, matchID %s", count, match.match_id);
        }
        
        if (count > max) {
            stream.end();
        }
    });
})

stream.on("end", function() {
    jsstream.end();
})

jsstream.on("end", function() {
    gzip.end();
});

gzip.on("end", function() {
    write.end();
    console.log("Done. Exported %s", count);
})