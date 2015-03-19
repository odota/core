#mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.one-jar.jar < ../testfiles/1193091757.dem > output.json
java -jar parser/target/stats-0.1.0.one-jar.jar < ../testfiles/766228935_legacy.dem > output.json
#wget http://replay133.valve.net/570/1235641720_1996593833.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar
#index out of bounds exception
wget http://replay122.valve.net/570/1317849236_1002325006.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.one-jar.jar

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