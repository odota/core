package albert.stats;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.match.EntityCollection;
import skadistats.clarity.match.TempEntityCollection;
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
import java.util.Arrays;
import java.util.HashMap;

public class Main {
    public static final float INTERVAL = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        boolean initialized = false;
        GameEventDescriptor combatLogDescriptor = null;
        JSONObject doc = new JSONObject();
        JSONArray log = new JSONArray();
        JSONObject hero_to_slot = new JSONObject();
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], CustomProfile.ENTITIES, CustomProfile.COMBAT_LOG, CustomProfile.ALL_CHAT);
        float nextInterval = 0;
        int gameZero = Integer.MIN_VALUE;
        int gameEnd = 0;
        int numPlayers = 10;

        while(iter.hasNext()) {
            iter.next().apply(match);
            int time = (int) match.getGameTime();
            Entity pr = match.getPlayerResource();
            //EntityCollection ec = match.getEntities();

            if (!initialized) {   
                doc.put("players", new JSONArray());
                doc.put("times", new JSONArray());
                doc.put("chat", new JSONArray());
                doc.put("heroes", new JSONObject());

                for (int i = 0; i < numPlayers; i++) {
                    String st = pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]);
                    byte[] b = st.getBytes();
                    String name = new String(b);
                    JSONObject player = new JSONObject();
                    player.put("steamid", pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]));
                    player.put("personaname", name);
                    player.put("buybacks", new JSONArray());
                    player.put("lh", new JSONArray());
                    player.put("gold", new JSONArray());
                    player.put("xp", new JSONArray());
                    doc.getJSONArray("players").put(player);
                }
                combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog"); 
                CombatLogEntry.init(
                    match.getStringTables().forName("CombatLogNames"), 
                    combatLogDescriptor
                );
                initialized = true;
            }

            int trueTime=time-gameZero;

            for (int i = 0; i < numPlayers; i++) {
                String hero = pr.getProperty("m_nSelectedHeroID" + "." + PLAYER_IDS[i]).toString();
                hero_to_slot.put(hero, i);
                JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                player.put("stuns", pr.getProperty("m_fStuns" + "." + PLAYER_IDS[i]));
                int handle = pr.getProperty("m_hSelectedHero" + "." + PLAYER_IDS[i]);
                /*
                Entity e = ec.getByHandle(handle);
                System.err.println(e);
                if (e!=null){
                    //System.err.format("hero: %s %s %s,%s %n", trueTime, i, e.getProperty("m_cellX"), e.getProperty("m_cellY"));
                }
                */
            }
            /*
            Iterator<Entity> runes = ec.getAllByDtName("DT_DOTA_Item_Rune");
            while (runes.hasNext()){
                Entity e = runes.next();
                //System.err.format("rune: %s %s %s,%s %n", trueTime, e.getProperty("m_iRuneType"), e.getProperty("m_cellX"), e.getProperty("m_cellY"));
            }
*/
            if (trueTime > nextInterval) {
                doc.getJSONArray("times").put(trueTime);
                for (int i = 0; i < numPlayers; i++) {
                    JSONObject player = doc.getJSONArray("players").getJSONObject(i);
                    player.getJSONArray("lh").put(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("xp").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    player.getJSONArray("gold").put(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                }
                nextInterval += INTERVAL;
            }
            for (UserMessage u : match.getUserMessages()) {
                String name = u.getName();
                if (name.equals("CDOTAUserMsg_ChatEvent")){
                    /*
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
                    */
                }
                else if (name.equals("CUserMsg_SayText2")){
                    String prefix = u.getProperty("prefix").toString();
                    int slot = -1;
                    JSONArray players = doc.getJSONArray("players");
                    for (int i = 0;i<players.length();i++){
                        String playerName = players.getJSONObject(i).getString("personaname");
                        //System.err.format("%s-%s,%s-%s %n",prefix, Arrays.toString(prefix.getBytes()), playerName, Arrays.toString(playerName.getBytes()));
                        if (players.getJSONObject(i).getString("personaname").equals(prefix)){
                            slot=i;
                        }
                    }
                    JSONObject entry = new JSONObject();
                    entry.put("prefix", prefix);
                    entry.put("text", u.getProperty("text"));
                    entry.put("time", time);
                    entry.put("slot", slot);
                    entry.put("type", "chat");
                    log.put(entry);
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
                        unit = cle.getAttackerName(); //source of buff
                        key = cle.getInflictorName(); //the buff
                        String unit2 = cle.getTargetName(); //target of buff
                        entry.put("unit", unit);
                        entry.put("unit2", unit2);
                        entry.put("time", time);
                        entry.put("key", key);
                        entry.put("type", "modifier_applied");
                        log.put(entry);
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
                        unit = cle.getTargetName();
                        val = cle.getValue();
                        key = String.valueOf(cle.getXpReason());
                        entry.put("unit", unit);                        
                        entry.put("time", time);
                        entry.put("value", val);
                        entry.put("key", key);
                        entry.put("type", "xp_log");
                        log.put(entry);
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
                        //todo, so far, only seeing axe spins here
                        //System.err.format("%s %s proc %s %s%n", time, cle.getAttackerName(), cle.getInflictorName(), cle.getTargetName() != null ? "on " + cle.getTargetName() : "");
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
            entry.put("time", entry.getInt("time")-gameZero);
            String type = entry.getString("type");
            //System.err.println(entry);
            if (type.equals("buybacks")){
                Integer slot = entry.getInt("slot");
                doc.getJSONArray("players").getJSONObject(slot).getJSONArray("buybacks").put(entry);
                continue;
            }
            if (type.equals("chat")){
                doc.getJSONArray("chat").put(entry);
                continue;
            }
            JSONObject heroes = doc.getJSONObject("heroes");
            String unit = entry.getString("unit");
            if (!heroes.has(unit)){
                addHero(unit, heroes);
            }
            JSONObject hero = heroes.getJSONObject(unit);
            JSONObject counts = hero.getJSONObject(type);
            String key = entry.getString("key");
            Integer count = counts.has(key) ? (Integer)counts.get(key) : 0;
            if(entry.has("value")){
                counts.put(key, count+entry.getInt("value"));
            }
            else{
                counts.put(key, count + 1);  
            }
            if (type.equals("itembuys")){
                hero.getJSONArray("timeline").put(entry);
            }
        }
        doc.put("game_zero", gameZero);
        doc.put("game_end", gameEnd);
        doc.put("hero_to_slot", hero_to_slot);

        System.out.println(doc);

        long tMatch = System.currentTimeMillis() - tStart;
        System.err.format("%s sec%n", tMatch / 1000.0);
    }

    private static void addHero(String hero, JSONObject map){
        JSONObject newHero = new JSONObject();
        newHero.put("timeline", new JSONArray());
        newHero.put("itemuses", new JSONObject());
        newHero.put("itembuys", new JSONObject());
        newHero.put("runes", new JSONObject());
        newHero.put("damage", new JSONObject());
        newHero.put("healing", new JSONObject());
        newHero.put("gold_log", new JSONObject());
        newHero.put("xp_log", new JSONObject());
        newHero.put("kills", new JSONObject());
        newHero.put("abilityuses", new JSONObject());
        newHero.put("hero_hits", new JSONObject());
        newHero.put("modifier_applied", new JSONObject());
        map.put(hero, newHero);
    }

    private static int getSlotByUnit(String unit, JSONObject heroes, JSONObject hero_to_slot){
        if (unit.startsWith("illusion_")){
            unit=unit.substring("illusion_".length());
        }
        if (heroes.has(unit)){
            String hero_id = heroes.getJSONObject(unit).get("id").toString();
            if (hero_to_slot.has(hero_id)){
                return hero_to_slot.getInt(hero_id);
            }
        }
        //attempt to recover hero name from unit
        if (unit.startsWith("npc_dota_")){
            unit = unit.substring("npc_dota_".length());
            for (int i =1 ;i<=unit.length();i++){
                String s = unit.substring(0,i);
                if (heroes.has(s)){
                    //System.err.format("%s to %s%n", unit, s);
                    return hero_to_slot.getInt(heroes.getJSONObject(s).get("id").toString());
                }
            }
        }
        //System.err.format("couldn't find hero for unit %s%n", unit);
        return -1;
    }

}
