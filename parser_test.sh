mvn -f parser/pom.xml package;
java -jar -Xmx128m parser/target/stats-0.1.0.jar replays/1175663508.dem > output.json;
#java -jar -Xmx128m parser/target/stats-0.1.0.jar uploads/b418e690ca5f7a26c53434b6cbee71dc.dem > output.json;
#java -jar -Xmx128m parser/target/stats-0.1.0.jar replays/1170654668.dem > output.json;
#java -jar parser/target/stats-0.1.0.jar replays/1151783218.dem -epilogue;