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
npm run maven && java -jar parser/target/stats-0.1.0.jar < testfiles/1436943655_684.dem      

#mongoexport --db dota --collection matches --query {match_id:1321352005} > output.json
 
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