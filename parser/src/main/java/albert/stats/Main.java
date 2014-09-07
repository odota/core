package albert.stats;
import java.util.*;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;

public class Main {
    public static final float MINUTES = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();

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
        float sec = MINUTES;
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ENTITIES, Profile.CHAT_MESSAGES);

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

        Map doc = new HashMap();
        doc.put("playerNames", playerNames);
        doc.put("steamIds", steamIds);
        doc.put("time", timeList);
        doc.put("lastHits", playerCreepScores);
        doc.put("denies", playerDenies);
        doc.put("xp", playerEXP);
        doc.put("gold", playerGold);
        doc.put("levels", playerLevel);

        System.out.println(doc);
        //output debug to stderr
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.println("parse time: "+(tMatch) / 1000.0);

    }

}
