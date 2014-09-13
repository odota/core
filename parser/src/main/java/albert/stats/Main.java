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
import com.dota2.proto.Demo.CDemoFileInfo;
import org.json.JSONObject;
import org.json.JSONArray;

public class Main {

    public static final float STAT_INTERVAL_SECONDS = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        JSONArray doc = new JSONArray();
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ENTITIES);
        float nextInterval = STAT_INTERVAL_SECONDS;

        while(iter.hasNext()) {
            iter.next().apply(match);
            int gameTime = (int) match.getGameTime();
            String time = String.valueOf(gameTime);
            if (gameTime > nextInterval) {
                Entity pr = match.getPlayerResource();

                //initialize doc on first tick
                if (doc.length()==0) {
                    for (int i = 0; i < PLAYER_IDS.length; i++) {
                        JSONObject player = new JSONObject();
                        player.put("display_name", pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]));
                        player.put("steamid", pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]));
                        player.put("last_hits", new JSONObject());
                        player.put("gold", new JSONObject());
                        player.put("xp", new JSONObject());
                        player.put("wards", new JSONObject());
                        player.put("runes", new JSONObject());
                        player.put("streaks", new JSONObject());
                        player.put("items", new JSONObject());
                        //distance traveled
                        //head to head kills
                        //feed gold
                        //consumable use
                        //user messages or combat log?
                        doc.put(player);
                    }
                }
                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    doc.getJSONObject(i).getJSONObject("streaks").put(time, pr.getProperty("m_iStreak" + "." + PLAYER_IDS[i]));
                    doc.getJSONObject(i).getJSONObject("last_hits").put(time, pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    doc.getJSONObject(i).getJSONObject("xp").put(time, pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    doc.getJSONObject(i).getJSONObject("gold").put(time, pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                }
                nextInterval += STAT_INTERVAL_SECONDS;
            }
        }
        System.out.println(doc);
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.println("parse time: " + tMatch / 1000.0);      
    }
}