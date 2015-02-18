#mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.jar < ../testfiles/1193091757.dem > output.json
#mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.jar < ../testfiles/1232722145_683c.dem > output.json
#wget http://replay186.valve.net/570/1232307498_696650003.dem.bz2 -qO- | bunzip2 | java -jar parser/target/stats-0.1.0.jar
mvn -f parser/pom.xml package && java -jar parser/target/stats-0.1.0.jar < ../testfiles/1238853003_369108933.dem > output.json