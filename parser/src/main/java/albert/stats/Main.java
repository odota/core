package albert.stats;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.mongodb.MongoClient;
import com.mongodb.DB;
import com.mongodb.DBCollection;
import com.mongodb.BasicDBObject;

import java.util.ArrayList;

import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;

public class Main {

    public static final float MINUTES = 60;
	public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};
    
    public static void main(String[] args) throws Exception {

        MongoClient mc = new MongoClient("localhost", 27017);
        DB db = mc.getDB("dota");
        DBCollection coll = db.getCollection("matchStats");
        
        long tStart = System.currentTimeMillis();

        Logger log = LoggerFactory.getLogger("stats");
       
        BasicDBObject doc = new BasicDBObject();
		String[] playerNames = new String[10];
        Long[] steamIds = new Long[10];
        ArrayList[] playerCreepScores = new ArrayList[10];
        ArrayList[] playerDenies = new ArrayList[10];
        ArrayList[] playerEXP = new ArrayList[10];
        ArrayList[] playerGold = new ArrayList[10];
        ArrayList[] playerLevel = new ArrayList[10];
        ArrayList timeList = new ArrayList();
        
        for (int i = 0; i < PLAYER_IDS.length; i++) {
            playerCreepScores[i] = new ArrayList();
            playerDenies[i] = new ArrayList();
            playerEXP[i] = new ArrayList();
            playerGold[i] = new ArrayList();
            playerLevel[i] = new ArrayList();            
        }

        Match match = new Match();
        
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ENTITIES, Profile.CHAT_MESSAGES);
    	
        float sec = MINUTES;
        
        while(iter.hasNext()) {
            iter.next().apply(match);

            float time = match.getGameTime();
            
            if (time > sec) {
                timeList.add((int) time);
                
                Entity pr = match.getPlayerResource();
                
                //Get player names
                if (playerNames[0] == null) {
					for (int i = 0; i < PLAYER_IDS.length; i++) {
                		playerNames[i] = pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]);
                        steamIds[i] = pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]);
                	}
                }
                
                for (int i = 0; i < PLAYER_IDS.length; i++) {
                	playerCreepScores[i].add(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    playerDenies[i].add(pr.getProperty("m_iDenyCount" + "." + PLAYER_IDS[i]));
                    playerEXP[i].add(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    playerGold[i].add(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                    playerLevel[i].add(pr.getProperty("m_iLevel" + "." + PLAYER_IDS[i]));                    
                }
                
                sec += MINUTES;
            }
        }

        doc.append("playerNames", playerNames)
        	.append("steamIds", steamIds)
        	.append("time", timeList)
        	.append("lastHits", playerCreepScores)
        	.append("denies", playerDenies)
        	.append("xp", playerEXP)
        	.append("gold", playerGold)
        	.append("levels", playerLevel);
        
        String fileName = args[0].substring(args[0].lastIndexOf("/") + 1);
        coll.update(
            new BasicDBObject("match_id", Integer.parseInt(fileName.substring(0, fileName.indexOf("_")))),
            new BasicDBObject("$set", doc)
        );
        
        long tMatch = System.currentTimeMillis() - tStart;
        log.info("total time taken: {}s", (tMatch) / 1000.0);
        
    }

}
