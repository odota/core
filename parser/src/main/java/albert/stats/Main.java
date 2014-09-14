package albert.stats;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;
import skadistats.clarity.model.UserMessage;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import com.dota2.proto.Demo.CDemoFileInfo;
import org.json.JSONObject;
import org.json.JSONArray;

public class Main {
    public static final float INTERVAL = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        boolean initialized = false;
        GameEventDescriptor combatLogDescriptor = null;
        JSONObject doc = new JSONObject();
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ALL);
        float nextInterval = INTERVAL;

        while(iter.hasNext()) {
            iter.next().apply(match);
            int time = (int) match.getGameTime();

            if (!initialized) {
                doc.put("players", new JSONArray());
                doc.put("combatlog", new JSONObject());
                doc.put("times", new JSONArray());

                Entity pr = match.getPlayerResource();

                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    JSONObject player = new JSONObject();
                    player.put("display_name", pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]));
                    player.put("steamid", pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]));
                    player.put("last_hits", new JSONArray());
                    player.put("gold", new JSONArray());
                    player.put("xp", new JSONArray());
                    player.put("buybacks", new JSONArray());
                    player.put("runes", new JSONArray());
                    player.put("glyphs", new JSONArray());
                    player.put("courier_kills", new JSONArray());
                    player.put("aegis", new JSONArray());
                    player.put("pauses", new JSONArray());
                    doc.getJSONArray("players").put(player);
                }
                combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog"); 
                CombatLogEntry.init(
                    match.getStringTables().forName("CombatLogNames"), 
                    combatLogDescriptor
                );
                initialized = true;
            }
            for (UserMessage u : match.getUserMessages()) {
                if (u.getName().startsWith("CDOTAUserMsg_ChatEvent")){
                    JSONArray players = doc.getJSONArray("players");
                    int player1=(int)u.getProperty("playerid_1");
                    int player2=(int)u.getProperty("playerid_2");
                    String type = u.getProperty("type").toString();

                    if (type.contains("RUNE")){
                        players.getJSONObject(player1).getJSONArray("runes").put(u.getProperty("value"));
                    }
                    else if (type.contains("ITEM_PURCHASE")){
                    }
                    else if (type.contains("GLYPH")){
                        players.getJSONObject(player1).getJSONArray("glyphs").put(time);
                    }
                    else if (type.contains("BUYBACK")){
                        players.getJSONObject(player1).getJSONArray("buybacks").put(time);
                    }
                    else if (type.contains("CONNECT")){
                    }
                    else if (type.contains("TOWER_KILL")){
                    }
                    else if (type.contains("TOWER_DENY")){
                    }
                    else if (type.contains("HERO_DENY")){
                    }
                    else if (type.contains("BARRACKS_KILL")){
                    }
                    else if (type.contains("COURIER_LOST")){
                        players.getJSONObject(player1).getJSONArray("courier_kills").put(time);
                    }
                    else if (type.contains("ROSHAN_KILL")){
                    }
                    else if (type.contains("AEGIS")){
                        players.getJSONObject(player1).getJSONArray("aegis").put(time);
                    }
                    else if (type.contains("_PAUSED")){
                        players.getJSONObject(player1).getJSONArray("pauses").put(time);
                    }
                    else if (type.contains("STREAK_KILL")){
                    }
                    else if (type.contains("HERO_KILL")){
                    }
                    else{
                    }
                }
            }
            for (GameEvent g : match.getGameEvents()) {
                if (g.getEventId() == combatLogDescriptor.getEventId()) {
                    CombatLogEntry cle = new CombatLogEntry(g);
                    JSONObject combatlog=doc.getJSONObject("combatlog");
                    String hero;
                    String target;
                    String item;
                    switch(cle.getType()) {
                        case 0:
                        //damage
                        break;
                        case 1:
                        //healing
                        break;
                        case 2:
                        //gain buff/debuff
                        break;
                        case 3:
                        //lose buff/debuff
                        break;
                        case 4:
                        //kill
                        hero = cle.getAttackerName();
                        target = cle.getTargetName();
                        if (cle.isTargetIllusion()){
                        }
                        else if (target.contains("observer")){
                        }
                        else if (target.contains("sentry")){
                        }
                        else if (hero.contains("hero") && target.contains("hero")){
                            insert(combatlog, hero);
                            JSONObject counts = combatlog.getJSONObject(hero).getJSONObject("kills");
                            Integer count = counts.has(target) ? (Integer)counts.get(target) : 0;
                            counts.put(target, count + 1);
                        }
                        else{
                        }
                        break;
                        case 5:
                        //ability use
                        break;
                        case 6:
                        //item use
                        hero = cle.getAttackerName();
                        item = cle.getInflictorName();
                        insert(combatlog, hero);
                        JSONObject counts = combatlog.getJSONObject(hero).getJSONObject("uses");
                        Integer count = counts.has(item) ? (Integer)counts.get(item) : 0;
                        counts.put(item, count + 1);
                        break;
                        case 8:
                        //gold gain/loss
                        break;
                        case 9:
                        //state
                        break;
                        case 10:
                        //xp gain
                        break;
                        case 11:
                        //purchase
                        hero = cle.getTargetName();
                        item = cle.getValueName();
                        insert(combatlog, hero);
                        if (!item.contains("recipe")){
                            JSONObject buyEntry = new JSONObject();
                            buyEntry.put("time", time);
                            buyEntry.put("name", item);
                            combatlog.getJSONObject(hero).getJSONArray("purchases").put(buyEntry);     
                        }
                        break;
                        case 12:
                        //buyback
                        break;
                        default:
                        DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
                        System.err.format("%s (%s): %s%n", type.name(), type.ordinal(), g);
                        break;
                    }
                }
            }

            if (time > nextInterval) {
                Entity pr = match.getPlayerResource();
                doc.getJSONArray("times").put(time);

                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                    //todo multiple heroes for ARDM, could update more than once a min
                    player.put("hero", pr.getProperty("m_nSelectedHeroID" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("last_hits").put(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("xp").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("gold").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                }
                nextInterval += INTERVAL;
            }
        }

        System.out.println(doc);
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.format("time: %s sec%n", tMatch / 1000.0);      
    }

    private static void insert(JSONObject combatlog, String hero){
        if(!combatlog.has(hero)){
            JSONObject heroObject = new JSONObject();
            heroObject.put("purchases", new JSONArray());
            heroObject.put("uses", new JSONObject());
            heroObject.put("kills", new JSONObject());
            combatlog.put(hero, heroObject);
        }
    }

}
