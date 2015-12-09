#mvn -f `dirname "$0"`/pom.xml package && java -jar `dirname "$0"`/target/stats-0.1.0.jar < testfiles/1781962623_source2.dem
mvn -f `dirname "$0"`/pom.xml package && java -jar `dirname "$0"`/target/stats-0.1.0.jar < 1977784185_1653363813.dem
