mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.one-jar.jar < ../testfiles/1193091757.dem > output.json
java -jar parser/target/stats-0.1.0.one-jar.jar < ../testfiles/766228935_legacy.dem > output.json
#wget http://replay133.valve.net/570/1235641720_1996593833.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar
#index out of bounds exception
wget http://replay122.valve.net/570/1317849236_1002325006.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar
#crash
wget http://replay123.valve.net/570/1336271164_1831063607.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar
#cyrillic
wget https://github.com/yasp-dota/testfiles/raw/master/1232307498_cyrillic.dem -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar

#6.84
mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.one-jar.jar < testfiles/1436943655_684.dem      

 db.matches.find({
    'players.account_id': 88367253
}, {
        start_time: 1,
        match_id: 1,
        duration: 1,
        cluster: 1,
        radiant_win: 1,
        parse_status: 1,
        parsed_data: 1,
        first_blood_time: 1,
        lobby_type: 1,
        game_mode: 1,
        "players.$": 1
    }
).explain()

 db.matches.find({
        players: {
            $elemMatch: {
                account_id: 88367253
            }
        }
    }, {
            "players.$": 1,
            start_time: 1,
            match_id: 1,
            duration: 1,
            cluster: 1,
            radiant_win: 1,
            parse_status: 1,
            parsed_data: 1,
            first_blood_time: 1,
            lobby_type: 1,
            game_mode: 1
    }).explain()

mongoexport --db dota --collection matches --query {match_id:1321352005} > output.json

/*
//detect rune spawns
                Iterator<Entity> runes = ec.getAllByDtName("DT_DOTA_Item_Rune");
                while (runes.hasNext()){
                Entity e = runes.next();
                Integer handle = e.getHandle();
                if (!seenEntities.contains(handle)){
                System.err.format("rune: time:%s,x:%s,y:%s,type:%s\n", time, e.getProperty("m_iRuneType"), e.getProperty("m_cellX"), e.getProperty("m_cellY"));
                seenEntities.add(handle);
                }
                }
 */
 
 #post a job to kue, didn't work with url for some reason
 curl -H "Content-Type: application/json" -X POST -d \
 '{
"type":"parse",
"data":{
"title":"test",
"payload":{"match_id":1318234022,"fileName":"./1318234022.dem"}
},
         "options" : {
         "priority": -15
       }
}' colab-sbx-244.oit.duke.edu:5000 --user user:pass