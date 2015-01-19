mvn -f parser/pom.xml package;
java -jar parser/target/stats-0.1.0.jar replays/1151783218.dem > output.json;
#java -jar parser/target/stats-0.1.0.jar replays/1170654668.dem > output.json;
#java -jar parser/target/stats-0.1.0.jar replays/1151783218.dem -epilogue;