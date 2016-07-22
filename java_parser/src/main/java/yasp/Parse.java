package yasp;

import com.google.gson.Gson;
import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.decoder.Util;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.model.s1.GameRulesStateType;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.OnEntityEntered;
import skadistats.clarity.processor.entities.OnEntityLeft;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.gameevents.CombatLog;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.source.MappedFileSource;
import skadistats.clarity.wire.common.proto.Demo.CDemoFileInfo;
import skadistats.clarity.wire.common.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_LocationPing;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_SpectatorPlayerUnitOrders;
import skadistats.clarity.wire.common.proto.DotaUserMessages.DOTA_COMBATLOG_TYPES;
import skadistats.clarity.wire.s1.proto.S1UserMessages.CUserMsg_SayText2;
import skadistats.clarity.wire.s2.proto.S2UserMessages.CUserMessageSayText2;
import skadistats.clarity.wire.s2.proto.S2DotaGcCommon.CMsgDOTAMatch;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
    
public class Parse {
    private final Logger log = LoggerFactory.getLogger(Main.class.getPackage().getClass());
    float INTERVAL = 1;
    float nextInterval = 0;
    Integer time = 0;
    int numPlayers = 10;
    int[] validIndices = new int[numPlayers];
    boolean init = false;
    int gameStartTime = 0;
    private Gson g = new Gson();
    HashMap<String, Integer> name_to_slot = new HashMap<String, Integer>();
    HashMap<Integer, Integer> slot_to_playerslot = new HashMap<Integer, Integer>();
    InputStream is = null;
    OutputStream os = null;
    
    public Parse(InputStream input, OutputStream output) throws IOException
    {
      is = input;
      os = output;
      long tStart = System.currentTimeMillis();
      new SimpleRunner(new InputStreamSource(is)).runWith(this);
      long tMatch = System.currentTimeMillis() - tStart;
      System.err.format("total time taken: %s\n", (tMatch) / 1000.0);
    }
    
    private class Entry {
        public Integer time;
        public String type;
        public Integer team;
        public String unit;
        public String key;
        public Integer value;
        public Integer slot;
        public Integer player_slot;
        //chat event fields
        public Integer player1;
        public Integer player2;
        //combat log fields
        public String attackername;
        public String targetname;
        public String sourcename;
        public String targetsourcename;
        public Boolean attackerhero;
        public Boolean targethero;
        public Boolean attackerillusion;
        public Boolean targetillusion;
        public String inflictor;
        public Integer gold_reason;
        public Integer xp_reason;
        public String valuename;
        //public Float stun_duration;
        //public Float slow_duration;
        //entity fields
        public Integer gold;
        public Integer lh;
        public Integer xp;
        public Integer x;
        public Integer y;
        public Integer z;
        public Float stuns;
        public Integer hero_id;
        public Integer life_state;
        public Integer level;
        public Integer kills;
        public Integer deaths;
        public Integer assists;
        public Integer denies;
        //public Boolean hasPredictedVictory;
        public Boolean entityleft;
        public Integer ehandle;
        
        public Entry() {
        }
        
        public Entry(Integer time) {
            this.time = time;
        }
    }

    public void output(Entry e) {
        try {
            this.os.write((g.toJson(e) + "\n").getBytes()); 
        }
        catch (IOException ex)
        {
            System.err.println(ex);
        }
    }
    
    //@OnMessage(GeneratedMessage.class)
    public void onMessage(Context ctx, GeneratedMessage message) {
        System.err.println(message.getClass().getName());
        System.out.println(message.toString());
    }

    /*
    //@OnMessage(CDOTAUserMsg_SpectatorPlayerClick.class)
    public void onSpectatorPlayerClick(Context ctx, CDOTAUserMsg_SpectatorPlayerClick message){
        Entry entry = new Entry(time);
        entry.type = "clicks";
        //need to get the entity by index
        entry.key = String.valueOf(message.getOrderType());
        //theres also target_index
        output(entry);
    }
    */
    
    @OnMessage(CMsgDOTAMatch.class)
    public void onDotaMatch(Context ctx, CMsgDOTAMatch message)
    {
        //TODO could use this for match overview data for uploads
        //System.err.println(message);
    }

    @OnMessage(CDOTAUserMsg_SpectatorPlayerUnitOrders.class)
    public void onSpectatorPlayerUnitOrders(Context ctx, CDOTAUserMsg_SpectatorPlayerUnitOrders message) {
        Entry entry = new Entry(time);
        entry.type = "actions";
        //the entindex points to a CDOTAPlayer.  This is probably the player that gave the order.
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntindex());
        entry.slot = getEntityProperty(e, "m_iPlayerID", null);
        //Integer handle = (Integer)getEntityProperty(e, "m_hAssignedHero", null);
        //Entity h = ctx.getProcessor(Entities.class).getByHandle(handle);
        //System.err.println(h.getDtClass().getDtName());
        //break actions into types?
        entry.key = String.valueOf(message.getOrderType());
        //System.err.println(message);
        output(entry);
    }


    @OnMessage(CDOTAUserMsg_LocationPing.class)
    public void onPlayerPing(Context ctx, CDOTAUserMsg_LocationPing message) {
        Entry entry = new Entry(time);
        entry.type = "pings";
        entry.slot = message.getPlayerId();
        /*
        System.err.println(message);
        player_id: 7
        location_ping {
          x: 5871
          y: 6508
          target: -1
          direct_ping: false
          type: 0
        }
        */
        //we could get the ping coordinates/type if we cared
        //entry.key = String.valueOf(message.getOrderType());
        output(entry);
    }

    @OnMessage(CDOTAUserMsg_ChatEvent.class)
    public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
        Integer player1 = message.getPlayerid1();
        Integer player2 = message.getPlayerid2();
        Integer value = message.getValue();
        String type = String.valueOf(message.getType());
        Entry entry = new Entry(time);
        entry.type = type;
        entry.player1 = player1;
        entry.player2 = player2;
        entry.value = value;
        output(entry);
    }

    @OnMessage(CUserMsg_SayText2.class)
    public void onAllChatS1(Context ctx, CUserMsg_SayText2 message) {
        Entry entry = new Entry(time);
        entry.unit =  String.valueOf(message.getPrefix());
        entry.key =  String.valueOf(message.getText());
        entry.type = "chat";
        output(entry);
    }

    @OnMessage(CUserMessageSayText2.class)
    public void onAllChatS2(Context ctx, CUserMessageSayText2 message) {
        Entry entry = new Entry(time);
        entry.unit = String.valueOf(message.getParam1());
        entry.key = String.valueOf(message.getParam2());
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntityindex());
        entry.slot = getEntityProperty(e, "m_iPlayerID", null);
        entry.type = "chat";
        output(entry);
    }

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(Context ctx, CDemoFileInfo message) {
        //beware of 4.2b limit!  we don't currently do anything with this, so we might be able to just remove this
        //we can't use the value field since it takes Integers
        //Entry matchIdEntry = new Entry();
        //matchIdEntry.type = "match_id";
        //matchIdEntry.value = message.getGameInfo().getDota().getMatchId();
        //output(matchIdEntry);
        
        //emit epilogue event to mark finish
        Entry epilogueEntry = new Entry();
        epilogueEntry.type = "epilogue";
        epilogueEntry.key = new Gson().toJson(message);
        output(epilogueEntry);
    }
    
    @OnCombatLogEntry
    public void onCombatLogEntry(Context ctx, CombatLogEntry cle) {
        try 
        {
            time = Math.round(cle.getTimestamp());
            //create a new entry
            Entry combatLogEntry = new Entry(time);
            combatLogEntry.type = cle.getType().name();
            //translate the fields using string tables if necessary (get*Name methods)
            combatLogEntry.attackername = cle.getAttackerName();
            combatLogEntry.targetname = cle.getTargetName();
            combatLogEntry.sourcename = cle.getDamageSourceName();
            combatLogEntry.targetsourcename = cle.getTargetSourceName();
            combatLogEntry.inflictor = cle.getInflictorName();
            combatLogEntry.gold_reason = cle.getGoldReason();
            combatLogEntry.xp_reason = cle.getXpReason();
            combatLogEntry.attackerhero = cle.isAttackerHero();
            combatLogEntry.targethero = cle.isTargetHero();
            combatLogEntry.attackerillusion = cle.isAttackerIllusion();
            combatLogEntry.targetillusion = cle.isTargetIllusion();
            combatLogEntry.value = cle.getValue();
            //combatLogEntry.stun_duration = cle.getStunDuration();
            //combatLogEntry.slow_duration = cle.getSlowDuration();
            //value may be out of bounds in string table, we can only get valuename if a purchase (type 11)
            if (cle.getType() == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_PURCHASE) {
                combatLogEntry.valuename = cle.getValueName();
            }
            output(combatLogEntry);
            
            if (cle.getType().ordinal() > 19) {
                System.err.println(cle);
            }
        }
        catch(Exception e)
        {
            System.err.println(e);
            System.err.println(cle);
        }
    }

    @OnEntityEntered
    public void onEntityEntered(Context ctx, Entity e) {
        processWardEntity(ctx, e, false);
    }
    
    @OnEntityLeft
    public void onEntityLeft(Context ctx, Entity e) {
        processWardEntity(ctx, e, true);
    }

    @UsesEntities
    @OnTickStart
    public void onTickStart(Context ctx, boolean synthetic) {
        //TODO check engine to decide whether to use s1 or s2 entities
        //ctx.getEngineType()
        
        //s1 DT_DOTAGameRulesProxy
        Entity grp = ctx.getProcessor(Entities.class).getByDtName("CDOTAGamerulesProxy");
        Entity pr = ctx.getProcessor(Entities.class).getByDtName("CDOTA_PlayerResource");
        Entity dData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataDire");
        Entity rData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataRadiant");
        if (grp != null) 
        {
            //System.err.println(grp);
            //dota_gamerules_data.m_iGameMode = 22
            //dota_gamerules_data.m_unMatchID64 = 1193091757
            time = Math.round((float) getEntityProperty(grp, "m_pGameRules.m_fGameTime", null));
            
            //initialize nextInterval value
            if (nextInterval == 0)
            {
                nextInterval = time;
            }
            //alternate to combat log for getting game zero time (looks like this is set at the same time as the game start, so it's not any better for streaming)
            /*
            int currGameStartTime = Math.round( (float) grp.getProperty("m_pGameRules.m_flGameStartTime"));
            if (currGameStartTime != gameStartTime){
                gameStartTime = currGameStartTime;
                System.err.println(gameStartTime);
                System.err.println(time);
            }
            */
        }
        if (pr != null) 
        {
            //Radiant coach shows up in vecPlayerTeamData as position 5
            //all the remaining dire entities are offset by 1 and so we miss reading the last one and don't get data for the first dire player
            //coaches appear to be on team 1, radiant is 2 and dire is 3?
            //construct an array of valid indices to get vecPlayerTeamData from
            if (!init) 
            {
                int added = 0;
                int i = 0;
                //according to @Decoud Valve seems to have fixed this issue and players should be in first 10 slots again
                //sanity check of i to prevent infinite loop when <10 players?
                while (added < numPlayers && i < 100) {
                    try 
                    {
                        //check each m_vecPlayerData to ensure the player's team is radiant or dire
                        int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", i);
                        int teamSlot = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iTeamSlot", i);
                        Long steamid = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerSteamID", i);
                        //System.err.format("%s %s %s: %s\n", i, playerTeam, teamSlot, steamid);
                        if (playerTeam == 2 || playerTeam == 3) {
                            //output the player_slot based on team and teamslot
                            Entry entry = new Entry(time);
                            entry.type = "player_slot";
                            entry.key = String.valueOf(added);
                            entry.value = (playerTeam == 2 ? 0 : 128) + teamSlot;
                            output(entry);
                            //add it to validIndices, add 1 to added
                            validIndices[added] = i;
                            added += 1;
                            slot_to_playerslot.put(added, entry.value);
                        }
                    }
                    catch(Exception e) 
                    {
                        //swallow the exception when an unexpected number of players (!=10)
                        //System.err.println(e);
                    }

                    i += 1;
                }
                init = true;
            }

            if (time >= nextInterval) 
            {
                //System.err.println(pr);
                for (int i = 0; i < numPlayers; i++) 
                {
                    Integer hero = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_nSelectedHeroID", validIndices[i]);
                    int handle = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_hSelectedHero", validIndices[i]);
                    int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", validIndices[i]);
                    int teamSlot = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iTeamSlot", validIndices[i]);
                    //System.err.format("hero:%s i:%s teamslot:%s playerteam:%s\n", hero, i, teamSlot, playerTeam);

                    //2 is radiant, 3 is dire, 1 is other?
                    Entity dataTeam = playerTeam == 2 ? rData : dData;

                    Entry entry = new Entry(time);
                    entry.type = "interval";
                    entry.slot = i;
                    
                    if (teamSlot >= 0) 
                    {
                        entry.gold = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedGold", teamSlot);
                        entry.lh = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iLastHitCount", teamSlot);
                        entry.xp = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedXP", teamSlot);
                        entry.stuns = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_fStuns", teamSlot);
                    }

                    try
                    {
                        entry.level = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iLevel", validIndices[i]);
                        entry.kills = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iKills", validIndices[i]);
                        entry.deaths = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iDeaths", validIndices[i]);
                        entry.assists = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iAssists", validIndices[i]);
                        entry.denies = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iDenyCount", teamSlot);
                    }
                    catch(Exception e)
                    {
                        //swallow exceptions encountered while trying to get these additional values
                        //System.err.println(e);
                    }
                    //TODO: gem, rapier time?
                    //https://github.com/yasp-dota/yasp/issues/333
                    //need to dump inventory items for each player and possibly keep track of item entity handles
                    
                    //get the player's hero entity
                    Entity e = ctx.getProcessor(Entities.class).getByHandle(handle);
                    //get the hero's coordinates
                    if (e != null) 
                    {
                        //System.err.println(e);
                        entry.x = getEntityProperty(e, "CBodyComponent.m_cellX", null);
                        entry.y = getEntityProperty(e, "CBodyComponent.m_cellY", null);
                        //System.err.format("%s, %s\n", entry.x, entry.y);
                        //get the hero's entity name, ex: CDOTA_Hero_Zuus
                        entry.unit = e.getDtClass().getDtName();
                        entry.hero_id = hero;
                        entry.life_state = getEntityProperty(e, "m_lifeState", null);
                        //System.err.format("%s: %s\n", entry.unit, entry.life_state);
                        //check if hero has been assigned to entity
                        if (hero > 0) 
                        {
                            //get the hero's entity name, ex: CDOTA_Hero_Zuus
                            String unit = e.getDtClass().getDtName();
                            //grab the end of the name, lowercase it
                            String ending = unit.substring("CDOTA_Unit_Hero_".length());
                            //valve is bad at consistency and the combat log name could involve replacing camelCase with _ or not!
                            //double map it so we can look up both cases
                            String combatLogName = "npc_dota_hero_" + ending.toLowerCase();
                            //don't include final underscore here since the first letter is always capitalized and will be converted to underscore
                            String combatLogName2 = "npc_dota_hero" + ending.replaceAll("([A-Z])", "_$1").toLowerCase();
                            //System.err.format("%s, %s, %s\n", unit, combatLogName, combatLogName2);
                            //populate for combat log mapping
                            name_to_slot.put(combatLogName, entry.slot);
                            name_to_slot.put(combatLogName2, entry.slot);
                        }
                    }
                    output(entry);
                }
                nextInterval += INTERVAL;
            }
        }
    }

    public <T> T getEntityProperty(Entity e, String property, Integer idx) {
        if (e == null) {
            return null;
        }
        if (idx != null) {
            property = property.replace("%i", Util.arrayIdxToString(idx));
        }
        FieldPath fp = e.getDtClass().getFieldPathForName(property);
        return e.getPropertyForFieldPath(fp);
    }
    
    public void processWardEntity(Context ctx, Entity e, boolean entityLeft)
    {
        //CDOTA_NPC_Observer_Ward
        //CDOTA_NPC_Observer_Ward_TrueSight
        //s1 "DT_DOTA_NPC_Observer_Ward"
        //s1 "DT_DOTA_NPC_Observer_Ward_TrueSight"
        boolean isObserver = e.getDtClass().getDtName().equals("CDOTA_NPC_Observer_Ward");
        boolean isSentry = e.getDtClass().getDtName().equals("CDOTA_NPC_Observer_Ward_TrueSight");
        if (isObserver || isSentry) {
            //System.err.println(e);
            Entry entry = new Entry(time);
            Integer x = getEntityProperty(e, "CBodyComponent.m_cellX", null);
            Integer y = getEntityProperty(e, "CBodyComponent.m_cellY", null);
            Integer z = getEntityProperty(e, "CBodyComponent.m_cellZ", null);
            Integer[] pos = {x, y};
            entry.x = x;
            entry.y = y;
            entry.z = z;
            if (entityLeft)
            {
                entry.type = isObserver ? "obs_left" : "sen_left";
            }
            else
            {
                entry.type = isObserver ? "obs" : "sen";
            }
            entry.key = Arrays.toString(pos);
            entry.entityleft = entityLeft;
            entry.ehandle = e.getHandle();
            //System.err.println(entry.key);
            Integer owner = getEntityProperty(e, "m_hOwnerEntity", null);
            Entity ownerEntity = ctx.getProcessor(Entities.class).getByHandle(owner);
            entry.slot = ownerEntity != null ? (Integer) getEntityProperty(ownerEntity, "m_iPlayerID", null) : null;
            //2/3 radiant/dire
            //entry.team = e.getProperty("m_iTeamNum");
            output(entry);
        }
    }
}
