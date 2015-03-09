#mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.jar < ../testfiles/1193091757.dem > output.json
mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.jar < ../testfiles/1232722145_683c.dem > output.json
java -jar parser/target/stats-0.1.0.jar < ../testfiles/766228935_legacy.dem > output.json
java -jar parser/target/stats-0.1.0.jar < ../testfiles/766228935_legacy.dem > output.json
#wget http://replay133.valve.net/570/1235641720_1996593833.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.jar
#wget http://replay114.valve.net/570/1236324064_1607451262.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.jar
wget http://replay133.valve.net/570/1291069956_213042456.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.jar > output.json

#index out of bounds exception
wget http://replay151.valve.net/570/1305144352_560278439.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.jar


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