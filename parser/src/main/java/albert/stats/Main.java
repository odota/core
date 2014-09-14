package albert.stats;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;
import skadistats.clarity.model.UserMessage;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import com.dota2.proto.Demo.CDemoFileInfo;
import org.json.JSONObject;
import org.json.JSONArray;

public class Main {
    public static final float INTERVAL = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    private static void insertHero(JSONObject combatlog, String hero, String key, JSONObject value){
        if(!combatlog.has(hero)){
            JSONObject heroObject = new JSONObject();
            heroObject.put("purchases", new JSONArray());
            heroObject.put("items", new JSONArray());
            combatlog.put(hero, heroObject);
        }
        combatlog.getJSONObject(hero).getJSONArray(key).put(value);                                      
    }

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
            int gameTime = (int) match.getGameTime();
            String time = String.valueOf(gameTime);

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
                    player.put("streaks", new JSONArray());
                    player.put("buybacks", new JSONArray());
                    player.put("kills", new JSONArray());
                    player.put("runes", new JSONArray());
                    player.put("purchases", new JSONArray());
                    player.put("glyphs", new JSONArray());
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
                    if (u.getProperty("type").toString().contains("HERO_KILL")){
                        players.getJSONObject((int)u.getProperty("playerid_2")).getJSONArray("kills").put(u.getProperty("playerid_1"));
                    }
                    else if (u.getProperty("type").toString().contains("STREAK_KILL")){
                        players.getJSONObject((int)u.getProperty("playerid_2")).getJSONArray("kills").put(u.getProperty("playerid_1"));
                    }
                    else if (u.getProperty("type").toString().contains("RUNE")){
                        players.getJSONObject((int)u.getProperty("playerid_1")).getJSONArray("runes").put(u.getProperty("value"));
                    }
                    else if (u.getProperty("type").toString().contains("ITEM_PURCHASE")){
                    }
                    else if (u.getProperty("type").toString().contains("GLYPH")){
                        players.getJSONObject((int)u.getProperty("playerid_1")).getJSONArray("glyphs").put(time);
                    }
                    else if (u.getProperty("type").toString().contains("BUYBACK")){
                        players.getJSONObject((int)u.getProperty("playerid_1")).getJSONArray("buybacks").put(time);
                    }
                    else if (u.getProperty("type").toString().contains("CONNECT")){
                    }
                    else if (u.getProperty("type").toString().contains("TOWER_KILL")){
                    }
                    else if (u.getProperty("type").toString().contains("BARRACKS_KILL")){
                    }
                    else{
                        System.err.println(u);  
                    }
                    //courier kill?
                    //roshan?
                    //aegis?
                }
            }
            for (GameEvent g : match.getGameEvents()) {
                //dewards?
                //distance traveled
                if (g.getEventId() == combatLogDescriptor.getEventId()) {
                    CombatLogEntry cle = new CombatLogEntry(g);
                    JSONObject combatlog=doc.getJSONObject("combatlog");
                    switch(cle.getType()) {
                        case 0:
                        /*
                    System.out.format("{} {} hits {}{} for {} damage{}", 
                             time, 
                             cle.getAttackerNameCompiled(),
                             cle.getTargetNameCompiled(), 
                             cle.getInflictorName() != null ? String.format(" with %s", cle.getInflictorName()) : "",
                             cle.getValue(),
                             cle.getHealth() != 0 ? String.format(" (%s->%s)", cle.getHealth() + cle.getValue(), cle.getHealth()) : ""
                            );
                            */
                        break;
                        case 1:
                        /*
                    System.out.format("{} {}'s {} heals {} for {} health ({}->{})", 

                             time, 

                             cle.getAttackerNameCompiled(), 

                             cle.getInflictorName(), 

                             cle.getTargetNameCompiled(), 

                             cle.getValue(), 

                             cle.getHealth() - cle.getValue(), 

                             cle.getHealth()

                            );

                            */
                        break;
                        case 2:
                        //look in user message log for runes?
                        /*
                    System.out.format("{} {} receives {} buff/debuff from {}", 
                             time, 
                             cle.getTargetNameCompiled(), 
                             cle.getInflictorName(), 
                             cle.getAttackerNameCompiled()
                            );
                            */
                        break;
                        case 3:
                        /*
                    System.out.format("{} {} loses {} buff/debuff", 
                             time, 
                             cle.getTargetNameCompiled(), 
                             cle.getInflictorName()
                            );
                            */
                        break;

                        case 4:

                        //System.out.format("[KILL] %s, %s%n",cle.getAttackerName(),cle.getTargetName());

                        break;


                        case 5:

                        /*

                        JSONObject abilityEntry = new JSONObject();

                        abilityEntry.put("time", time);

                        abilityEntry.put("name", cle.getInflictorName());

                        insertHero(combatlog, cle.getAttackerName(), "abilities", abilityEntry);

                        */

                        break;
                        case 6:

                        JSONObject itemEntry = new JSONObject();

                        itemEntry.put("time", time);

                        itemEntry.put("name", cle.getInflictorName());

                        insertHero(combatlog, cle.getAttackerName(), "items", itemEntry);

                        break;

                        case 8:

                        /*

                    System.out.format("{} {} {} {} gold", 

                             time, 

                             cle.getTargetNameCompiled(),

                             cle.getValue() < 0 ? "loses" : "receives",

                             Math.abs(cle.getValue())

                            );

                            */

                        break;

                        case 9:

                        //game state

                        //System.out.format("[STATE] %s%n", GameRulesStateType.values()[cle.getValue() - 1]); 

                        break;

                        case 10:

                        /*

                    System.out.format("{} {} gains {} XP", 

                             time, 

                             cle.getTargetNameCompiled(),

                             cle.getValue()

                            );
                            */
                        break;
                        case 11:
                        JSONObject buyEntry = new JSONObject();
                        buyEntry.put("time", time);
                        buyEntry.put("name", cle.getValueName());
                        insertHero(combatlog, cle.getTargetName(), "purchases", buyEntry);
                        break;
                        case 12:
                        //doc.getJSONArray("players").getJSONObject(cle.getValue()).getJSONArray("buybacks").put(time);
                        break;
                        default:
                        DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
                        System.err.format("%s (%s): %s%n", type.name(), type.ordinal(), g);
                        break;
                    }

                }

            }

            if (gameTime > nextInterval) {
                Entity pr = match.getPlayerResource();
                doc.getJSONArray("times").put(time);

                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                    player.put("hero", pr.getProperty("m_nSelectedHeroID" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("streaks").put(pr.getProperty("m_iStreak" + "." + PLAYER_IDS[i]));
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

}
