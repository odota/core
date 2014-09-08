package albert.stats;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;
import org.joda.time.Duration;
import org.joda.time.format.PeriodFormatter;
import org.joda.time.format.PeriodFormatterBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import org.json.JSONObject;
import org.json.JSONArray;

public class Main {

    public static final float SECONDS_IN_MINUTE = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();

        String[] playerNames = new String[10];
        Long[] steamIds = new Long[10];
        JSONArray playerCreepScores = new JSONArray();
        JSONArray playerDenies = new JSONArray();
        JSONArray playerEXP = new JSONArray();
        JSONArray playerGold = new JSONArray();
        JSONArray playerLevel = new JSONArray();
        JSONArray timeList = new JSONArray();

        for (int i = 0; i < PLAYER_IDS.length; i++) {
            playerCreepScores.put(new JSONArray());
            playerDenies.put(new JSONArray());
            playerEXP.put(new JSONArray());
            playerGold.put(new JSONArray());
            playerLevel.put(new JSONArray());          
        }

        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ENTITIES);
        float nextMinute = SECONDS_IN_MINUTE;

        while(iter.hasNext()) {
            iter.next().apply(match);
            float gameTime = match.getGameTime();

            if (gameTime > nextMinute) {
                timeList.put((int) gameTime);
                Entity pr = match.getPlayerResource();

                //Get player names
                if (playerNames[0] == null) {
                    for (int i = 0; i < PLAYER_IDS.length; i++) {
                        playerNames[i] = pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]);
                        steamIds[i] = pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]);
                    }
                }
                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    playerCreepScores.getJSONArray(i).put(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    playerDenies.getJSONArray(i).put(pr.getProperty("m_iDenyCount" + "." + PLAYER_IDS[i]));
                    playerEXP.getJSONArray(i).put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    playerGold.getJSONArray(i).put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                    playerLevel.getJSONArray(i).put(pr.getProperty("m_iLevel" + "." + PLAYER_IDS[i]));                    
                }
                nextMinute += SECONDS_IN_MINUTE;
            }
        }

        JSONObject doc = new JSONObject();
        doc.put("playerNames", playerNames);
        doc.put("steamIds", steamIds);
        doc.put("time", timeList);
        doc.put("lastHits", playerCreepScores);
        doc.put("denies", playerDenies);
        doc.put("xp", playerEXP);
        doc.put("gold", playerGold);
        doc.put("levels", playerLevel);
        System.out.println(doc);

        long tMatch = System.currentTimeMillis() - tStart;
        System.err.println("time: " + tMatch / 1000.0);      
    }
}