package albert.stats;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.TickIterator;
import skadistats.clarity.model.UserMessage;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import com.dota2.proto.Demo.CDemoFileInfo;
import org.json.JSONObject;
import org.json.JSONArray;
import org.json.JSONTokener;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.FileReader;
import java.util.Iterator;

public class Main {
    public static final float INTERVAL = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        boolean initialized = false;
        GameEventDescriptor combatLogDescriptor = null;
        JSONObject doc = new JSONObject();
        JSONArray log = new JSONArray();
        JSONArray hero_history = new JSONArray();
        JSONObject hero_to_slot = new JSONObject();
        JSONObject name_to_slot = new JSONObject();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String s;
        String input = "";
        while ((s = in.readLine()) != null && s.length() != 0){
            input+=s;
        }
        JSONObject heroes = new JSONObject(new JSONTokener(input));
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], CustomProfile.ENTITIES, CustomProfile.COMBAT_LOG, CustomProfile.CHAT_MESSAGES, CustomProfile.ALL_CHAT);
        float nextInterval = 0;
        int gameZero = Integer.MIN_VALUE;
        int gameEnd = 0;

        while(iter.hasNext()) {
            iter.next().apply(match);
            int time = (int) match.getGameTime();
            Entity pr = match.getPlayerResource();

            if (!initialized) {
                doc.put("players", new JSONArray());
                doc.put("times", new JSONArray());
                doc.put("chat", new JSONArray());
                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    doc.getJSONArray("players").put(new JSONObject());
                    JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                    player.put("personaname", pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]));
                    player.put("steamid", pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]));
                    player.put("log", new JSONArray());
                    player.put("itemuses", new JSONObject());
                    player.put("itembuys", new JSONObject());
                    player.put("buybacks", new JSONObject());
                    player.put("runes", new JSONObject());
                    player.put("damage", new JSONObject());
                    player.put("healing", new JSONObject());
                    player.put("gold_log", new JSONObject());
                    player.put("kills", new JSONObject());
                    player.put("abilityuses", new JSONObject());
                    player.put("hero_hits", new JSONObject());
                    player.put("lh", new JSONArray());
                    player.put("gold", new JSONArray());
                    player.put("xp", new JSONArray());
                    name_to_slot.put(player.getString("personaname"), i);
                }
                combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog"); 
                CombatLogEntry.init(
                    match.getStringTables().forName("CombatLogNames"), 
                    combatLogDescriptor
                );
                initialized = true;
            }

            int trueTime=time-gameZero;
            if (trueTime > nextInterval) {
                doc.getJSONArray("times").put(trueTime);
                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                    player.getJSONArray("lh").put(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("xp").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("gold").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));

                    String hero = pr.getProperty("m_nSelectedHeroID" + "." + PLAYER_IDS[i]).toString();
                    if (!hero.equals("-1")){
                        hero_to_slot.put(hero, i);
                    }
                }
                nextInterval += INTERVAL;
            }
            for (UserMessage u : match.getUserMessages()) {
                String name = u.getName();
                if (name.equals("CDOTAUserMsg_ChatEvent")){
                    JSONArray players = doc.getJSONArray("players");
                    String player1=u.getProperty("playerid_1").toString();
                    String player2=u.getProperty("playerid_2").toString();
                    String type = u.getProperty("type").toString();
                    String value = u.getProperty("value").toString();
                    JSONObject entry = new JSONObject();
                    if (type.equals("CHAT_MESSAGE_HERO_KILL")){
                        //System.err.format("%s,%s%n", time, u);
                    }
                    else if (type.equals("CHAT_MESSAGE_BUYBACK")){
                        //System.err.format("%s,%s%n", time, u); 
                    }
                    else if (type.equals("CHAT_MESSAGE_RANDOM")){
                    }
                    else if (type.equals("CHAT_MESSAGE_ITEM_PURCHASE")){
                    }
                    else if (type.equals("CHAT_MESSAGE_GLYPH_USED")){
                    }
                    else if (type.equals("CHAT_MESSAGE_REPORT_REMINDER")){
                    }     
                    else if (type.equals("CHAT_MESSAGE_ROSHAN_KILL")){
                    }  
                    else if (type.equals("CHAT_MESSAGE_AEGIS")){
                    }  
                    else if (type.equals("CHAT_MESSAGE_SUPER_CREEPS")){
                    }       
                    else if (type.equals("CHAT_MESSAGE_TOWER_DENY")){
                    }  
                    else if (type.equals("CHAT_MESSAGE_HERO_DENY")){
                    }  
                    else if (type.equals("CHAT_MESSAGE_STREAK_KILL")){
                    }
                    else if (type.equals("CHAT_MESSAGE_TOWER_KILL")){
                    }                
                    else if (type.equals("CHAT_MESSAGE_BARRACKS_KILL")){
                    }
                    else if (type.equals("CHAT_MESSAGE_INTHEBAG")){
                    }
                    else if (type.contains("CONNECT")){
                    }
                    else if (type.contains("PAUSE")){
                    }
                    else{ 
                        System.err.format("%s %s%n", time, u);
                    }
                }
                else if (name.equals("CUserMsg_SayText2")){
                    JSONObject entry = new JSONObject();
                    entry.put("prefix", u.getProperty("prefix"));
                    entry.put("text", u.getProperty("text"));
                    entry.put("time", time);
                    //entry.put("slot", name_to_slot.getInt(u.getProperty("prefix").toString()));
                    doc.getJSONArray("chat").put(entry);
                }
                else if (name.equals("CDOTAUserMsg_SpectatorPlayerClick")){

                }
                else if (name.equals("CDOTAUserMsg_ParticleManager")){

                }
                else if (name.equals("CDOTAUserMsg_UnitEvent")){

                }
                else if (name.equals("CDOTAUserMsg_OverheadEvent")){

                }
                else if (name.equals("CDOTAUserMsg_SharedCooldown")){

                }
                else if (name.contains("CDOTAUserMsg_MinimapEvent")){

                }
                else if (name.contains("CUserMsg_SendAudio")){

                }
                else if (name.contains("Projectile")){

                }
                else if (name.equals("CUserMsg_TextMsg")){

                }
                else if (name.equals("CDOTAUserMsg_HudError")){

                }
                else{
                    System.err.format("%s %s%n", time, u); 
                }
            }

            for (GameEvent g : match.getGameEvents()) {
                if (g.getEventId() == combatLogDescriptor.getEventId()) {
                    CombatLogEntry cle = new CombatLogEntry(g);
                    String unit;
                    String key;
                    int val;
                    JSONObject entry = new JSONObject();
                    switch(cle.getType()) {
                        case 0:
                        //damage
                        unit = cle.getAttackerName();
                        key = cle.getTargetName();
                        val = cle.getValue();
                        if (cle.isTargetIllusion()){
                            key+="_illusion";
                        }
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("value", val);
                        entry.put("type", "damage");
                        log.put(entry);
                        //break down damage instances on heroes by inflictor to get skillshot stats, only track hero hits
                        key=cle.getInflictorName();
                        if (cle.isTargetHero() && key !=null){
                            JSONObject entry2 = new JSONObject();
                            entry2.put("unit", unit);                        
                            entry2.put("time", time);
                            entry2.put("key", key);
                            entry2.put("type", "hero_hits");
                            log.put(entry2);
                        }
                        break;
                        case 1:
                        //healing
                        unit = cle.getAttackerName();
                        key = cle.getTargetName();
                        val = cle.getValue();
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("value", val);
                        entry.put("type", "healing");
                        log.put(entry);
                        break;
                        case 2:
                        //gain buff/debuff
                        unit = cle.getAttackerName();
                        key = cle.getInflictorName();
                        String target = cle.getTargetName();
                        //System.err.format("%s,%s,%s,%s%n", time, unit, key, target);
                        /*
                            entry.put("unit", unit);                        
                            entry.put("time", time);
                            entry.put("key", key);
                            log.put(entry);
                            */
                        break;
                        case 3:
                        //lose buff/debuff
                        /*
                            log.info("{} {} loses {} buff/debuff", 
                            time, 
                            cle.getTargetNameCompiled(), 
                            cle.getInflictorName()
                        );
                        */
                        break;
                        case 4:
                        //kill
                        unit = cle.getAttackerName();
                        key = cle.getTargetName();
                        if (cle.isTargetIllusion()){
                            key+="_illusion";
                        }
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("type", "kills");
                        log.put(entry);
                        break;
                        case 5:
                        //ability use
                        unit = cle.getAttackerName();
                        key = cle.getInflictorName();
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("type", "abilityuses");
                        log.put(entry);
                        break;
                        case 6:
                        //item use
                        unit = cle.getAttackerName();
                        key = cle.getInflictorName();
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("type", "itemuses");
                        log.put(entry);
                        break;
                        case 8:
                        //gold gain/loss
                        key = String.valueOf(cle.getGoldReason());
                        unit = cle.getTargetName();
                        val = cle.getValue();
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("value", val);
                        entry.put("key", key);
                        entry.put("type", "gold_log");
                        log.put(entry);
                        break;
                        case 9:
                        //state
                        String state =  GameRulesStateType.values()[cle.getValue() - 1].toString();
                        if (state.equals("PLAYING")){
                            gameZero = time;
                        }
                        if (state.equals("POST_GAME")){
                            gameEnd = time;
                        }
                        break;
                        case 10:
                        //xp gain
                        /*
                         log.info("{} {} gains {} XP", 
                            time, 
                            cle.getTargetNameCompiled(),
                            cle.getValue()
                        );
                        */
                        break;
                        case 11:
                        //purchase
                        unit = cle.getTargetName();
                        key = cle.getValueName();
                        if (!key.contains("recipe")){
                            entry.put("unit", unit);                        
                            entry.put("time", time);
                            entry.put("key", key);
                            entry.put("type", "itembuys");
                            log.put(entry);     
                        }
                        break;
                        case 12:
                        //buyback
                        entry.put("time", time);
                        entry.put("slot", String.valueOf(cle.getValue()));
                        entry.put("key", "buyback");
                        entry.put("type", "buybacks");
                        log.put(entry);
                        break;
                        case 13:
                        //ability trigger
                        System.err.format("%s %s proc %s %s%n", 
                                          time,
                                          cle.getAttackerName(),
                                          cle.getInflictorName(),
                                          cle.getTargetName() != null ? "on " + cle.getTargetName() : "");
                        break;
                        default:
                        DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
                        System.err.format("%s (%s): %s%n", type.name(), type.ordinal(), g);
                        break;
                    }
                }
            }
        }

        for (int i =0;i<log.length();i++){
            JSONObject entry = log.getJSONObject(i);
            System.err.println(entry);
            //correct the time
            entry.put("time", entry.getInt("time")-gameZero);

            String type = entry.getString("type");

            if (entry.has("unit")){
                entry.put("slot", getSlotByUnit(entry.getString("unit"), heroes, hero_to_slot));
            }
            if (entry.has("slot")){
                int slot = entry.getInt("slot");
                if (slot>=0){
                    JSONObject player = doc.getJSONArray("players").getJSONObject(slot);
                    JSONObject counts = player.getJSONObject(type);
                    if (entry.has("key")){
                        String key = entry.getString("key");
                        Integer count = counts.has(key) ? (Integer)counts.get(key) : 0;
                        if(entry.has("value")){
                            counts.put(key, count+entry.getInt("value"));
                        }
                        else{
                            counts.put(key, count + 1);  
                        }
                    }
                    if (type.equals("itembuys")){
                        player.getJSONArray("log").put(entry);
                    }
                }
            }
        }
        doc.put("game_zero", gameZero);
        doc.put("game_end", gameEnd);

        System.out.println(doc);

        long tMatch = System.currentTimeMillis() - tStart;
        System.err.format("time:%ssec%n", tMatch / 1000.0);
    }
    private static int getSlotByUnit(String unit, JSONObject heroes, JSONObject hero_to_slot){
        if (heroes.has(unit)){
            return hero_to_slot.getInt(heroes.getJSONObject(unit).get("id").toString());
        }
        //attempt to recover hero name from unit
        if (unit.startsWith("npc_dota_")){
            unit = unit.substring("npc_dota_".length());
            for (int i =1 ;i<=unit.length();i++){
                String s = unit.substring(0,i);
                if (heroes.has(s)){
                    System.err.format("%s to %s%n", unit, s);
                    return hero_to_slot.getInt(heroes.getJSONObject(s).get("id").toString());
                }
            }
        }
        return -1;
    }
}
