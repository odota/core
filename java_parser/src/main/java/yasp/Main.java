package yasp;

import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.decoder.Util;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.s1.GameRulesStateType;
import skadistats.clarity.processor.gameevents.OnGameEvent;
import skadistats.clarity.processor.gameevents.CombatLog;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.entities.OnEntityEntered;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.reader.OnTickEnd;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.wire.s1.proto.S1UserMessages.CUserMsg_SayText2;
import skadistats.clarity.wire.s2.proto.S2UserMessages.CUserMessageSayText2;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_LocationPing;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_SpectatorPlayerClick;
import skadistats.clarity.wire.common.proto.DotaUserMessages.CDOTAUserMsg_SpectatorPlayerUnitOrders;
import skadistats.clarity.wire.common.proto.DotaUserMessages.DOTA_COMBATLOG_TYPES;
import skadistats.clarity.wire.common.proto.Demo.CDemoFileInfo;
import skadistats.clarity.wire.common.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import skadistats.clarity.model.FieldPath;

import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Arrays;

import com.google.gson.Gson;

public class Main {
    private final Logger log = LoggerFactory.getLogger(Main.class.getPackage().getClass());
    float INTERVAL = 1;
    HashMap<Integer, Integer> slot_to_hero = new HashMap<>();
    HashMap<Long, Integer> steamid_to_slot = new HashMap<>();
    float nextInterval = 0;
    Integer time = 0;
    int numPlayers = 10;
    EventStream es = new EventStream();
    int[] validIndices = new int[numPlayers];
    boolean init = false;
    //Set<Integer> seenEntities = new HashSet<Integer>();

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
        es.output(entry);
    }
    */

    @OnMessage(CDOTAUserMsg_SpectatorPlayerUnitOrders.class)
    public void onSpectatorPlayerUnitOrders(Context ctx, CDOTAUserMsg_SpectatorPlayerUnitOrders message) {
        Entry entry = new Entry(time);
        entry.type = "actions";
        //the entindex points to a CDOTAPlayer.  This is probably the player that gave the order.
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntindex());
        Integer slot = getEntityProperty(e, "m_iPlayerID", null);
        entry.slot = slot;
        //Integer handle = (Integer)getEntityProperty(e, "m_hAssignedHero", null);
        //Entity h = ctx.getProcessor(Entities.class).getByHandle(handle);
        //System.err.println(h.getDtClass().getDtName());
        //break actions into types?
        entry.key = String.valueOf(message.getOrderType());
        //System.err.println(message);
        es.output(entry);
    }


    @OnMessage(CDOTAUserMsg_LocationPing.class)
    public void onPlayerPing(Context ctx, CDOTAUserMsg_LocationPing message) {
        Entry entry = new Entry(time);
        entry.type = "pings";
        Integer player1 = message.getPlayerId();
        entry.slot = player1;
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
        es.output(entry);
    }

    @OnMessage(CDOTAUserMsg_ChatEvent.class)
    public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
        CDOTAUserMsg_ChatEvent u = message;
        Integer player1 = u.getPlayerid1();
        Integer player2 = u.getPlayerid2();
        Integer value = u.getValue();
        String type = String.valueOf(u.getType());
        Entry entry = new Entry(time);
        entry.type = "chat_event";
        entry.subtype = type;
        entry.player1 = player1;
        entry.player2 = player2;
        entry.value = value;
        es.output(entry);
    }

    /*
    @OnMessage(CUserMsg_SayText2.class)
    public void onAllChatS1(Context ctx, CUserMsg_SayText2 message) {
        Entry entry = new Entry(time);
        entry.unit =  String.valueOf(message.getPrefix());
        entry.key =  String.valueOf(message.getText());
        entry.type = "chat";
        es.output(entry);
    }
    */

    @OnMessage(CUserMessageSayText2.class)
    public void onAllChatS2(Context ctx, CUserMessageSayText2 message) {
        Entry entry = new Entry(time);
        entry.unit = String.valueOf(message.getParam1());
        entry.key = String.valueOf(message.getParam2());
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntityindex());
        Integer slot = getEntityProperty(e, "m_iPlayerID", null);
        entry.slot = slot;
        entry.type = "chat";
        es.output(entry);
    }

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(Context ctx, CDemoFileInfo message) {
        //load epilogue
        CDemoFileInfo info = message;
        List<CPlayerInfo> players = info.getGameInfo().getDota().getPlayerInfoList();
        //names used to match all chat messages to players
        for (CPlayerInfo player : players) {
            Entry entry = new Entry();
            entry.type = "name";
            entry.key = player.getPlayerName();
            entry.slot = steamid_to_slot.get(player.getSteamid());
            es.output(entry);
        }
        for (CPlayerInfo player : players) {
            Entry entry = new Entry();
            entry.type = "steam_id";
            entry.key = String.valueOf(player.getSteamid());
            entry.slot = steamid_to_slot.get(player.getSteamid());
            es.output(entry);
        }
        if (true) {
            Entry entry = new Entry();
            entry.type = "match_id";
            entry.value = info.getGameInfo().getDota().getMatchId();
            es.output(entry);
        }
        if (true) {
            //emit epilogue event to mark finish
            Entry entry = new Entry();
            entry.type = "epilogue";
            entry.key = new Gson().toJson(info);
            es.output(entry);
        }
    }

    @OnCombatLogEntry
    public void onCombatLogEntry(Context ctx, CombatLog.Entry cle) {
        //System.err.format("stun: %s, slow: %s\n", cle.getStunDuration(), cle.getSlowDuration());
        //System.err.format("x: %s, y: %s\n", cle.getLocationX(), cle.getLocationY());
        //System.err.format("modifier_duration: %s, last_hits: %s, att_team: %s, target_team: %s, obs_placed: %s\n",cle.getModifierDuration(), cle.getAttackerTeam(), cle.getTargetTeam(), cle.getObsWardsPlaced());
        time = Math.round(cle.getTimestamp());
        String type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType()).name();
        if (true) {
            //create a new entry
            Entry entry = new Entry(time);
            entry.type = "combat_log";
            //entry.subtype=String.valueOf(cle.getType());
            entry.subtype = type;
            //translate the fields using string tables if necessary (get*Name methods)
            entry.attackername = cle.getAttackerName();
            entry.targetname = cle.getTargetName();
            entry.sourcename = cle.getSourceName();
            entry.targetsourcename = cle.getTargetSourceName();
            entry.inflictor = cle.getInflictorName();
            entry.gold_reason = cle.getGoldReason();
            entry.xp_reason = cle.getXpReason();
            entry.attackerhero = cle.isAttackerHero();
            entry.targethero = cle.isTargetHero();
            entry.attackerillusion = cle.isAttackerIllusion();
            entry.targetillusion = cle.isTargetIllusion();
            entry.value = cle.getValue();
            //value may be out of bounds in string table, we can only get valuename if a purchase (type 11)
            if ("DOTA_COMBATLOG_PURCHASE".equals(type)) {
                entry.valuename = cle.getValueName();
            }
            es.output(entry);
        }

        if ("DOTA_COMBATLOG_GAME_STATE".equals(type)) {
            //emit game state change ("PLAYING, POST_GAME, etc.") (type 9)
            //used to compute game zero time so we can display accurate timestamps
            Entry entry = new Entry(time);
            //if the value is out of bounds, just make it the value itself
            String state = GameRulesStateType.values().length >= cle.getValue() ? GameRulesStateType.values()[cle.getValue() - 1].toString() : String.valueOf(cle.getValue() - 1);
            entry.key = state;
            entry.type = "state";
            es.output(entry);
        }
    }

    @OnEntityEntered
    public void onEntityEntered(Context ctx, Entity e) {
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
            Integer[] pos = {x, y};
            entry.type = isObserver ? "obs" : "sen";
            entry.key = Arrays.toString(pos);
            //System.err.println(entry.key);
            Integer owner = getEntityProperty(e, "m_hOwnerEntity", null);
            Entity ownerEntity = ctx.getProcessor(Entities.class).getByHandle(owner);
            entry.slot = ownerEntity != null ? (Integer) getEntityProperty(ownerEntity, "m_iPlayerID", null) : null;
            //2/3 radiant/dire
            //entry.team = e.getProperty("m_iTeamNum");
            es.output(entry);
        }
    }

    @UsesEntities
    @OnTickStart
    public void onTickStart(Context ctx, boolean synthetic) {
        //s1 DT_DOTAGameRulesProxy
        Entity grp = ctx.getProcessor(Entities.class).getByDtName("CDOTAGamerulesProxy");
        Entity pr = ctx.getProcessor(Entities.class).getByDtName("CDOTA_PlayerResource");
        Entity dData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataDire");
        Entity rData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataRadiant");
        if (grp != null) {
            //System.err.println(grp);
            //dota_gamerules_data.m_iGameMode = 22
            //dota_gamerules_data.m_unMatchID64 = 1193091757
            time = Math.round((float) getEntityProperty(grp, "m_pGameRules.m_fGameTime", null));
        }
        if (pr != null) {
            //Radiant coach shows up in vecPlayerTeamData as position 5, and we end up:
            //setting slot_to_hero incorrectly, which leads to misattributed combat log data.
            //all the remaining dire entities are offset by 1 and so we miss reading the last one and don't get data for the first dire player
            //coaches appear to be on team 1, radiant is 2 and dire is 3?
            //construct an array of valid indices to get vecPlayerTeamData from
            if (!init) {
                int added = 0;
                int i = 0;
                while (added < numPlayers) {
                    //check each m_vecPlayerData to ensure the player's team is radiant or dire
                    int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", i);
                    if (playerTeam == 2 || playerTeam == 3) {
                        //if so, add it to validIndices, add 1 to added
                        validIndices[added] = i;
                        added += 1;
                    }

                    i += 1;
                }
                init = true;
            }

            if (time >= nextInterval) {
                //System.err.println(pr);
                for (int i = 0; i < numPlayers; i++) {
                    Integer hero = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_nSelectedHeroID", validIndices[i]);
                    int handle = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_hSelectedHero", validIndices[i]);
                    Long steamid = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerSteamID", validIndices[i]);
                    int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", validIndices[i]);
                    int teamSlot = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iTeamSlot", validIndices[i]);
                    //System.err.format("hero:%s i:%s teamslot:%s playerteam:%s\n", hero, i, teamSlot, playerTeam);

                    //2 is radiant, 3 is dire, 1 is other?
                    Entity dataTeam = playerTeam == 2 ? rData : dData;

                    Entry entry = new Entry(time);
                    entry.type = "interval";
                    entry.slot = i;

                    entry.gold = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedGold", teamSlot);
                    entry.lh = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iLastHitCount", teamSlot);
                    entry.xp = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedXP", teamSlot);
                    entry.stuns = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_fStuns", teamSlot);

                    //TODO: gem, rapier time?
                    //https://github.com/yasp-dota/yasp/issues/333
                    //need to dump inventory items for each player and possibly keep track of item entity handles

                    //time dead, count number of intervals where this value is >0?
                    //m_iRespawnSeconds.0000

                    steamid_to_slot.put(steamid, i);

                    //get the player's hero entity
                    Entity e = ctx.getProcessor(Entities.class).getByHandle(handle);
                    //get the hero's coordinates
                    if (e != null) {
                        //System.err.println(e);
                        entry.x = getEntityProperty(e, "CBodyComponent.m_cellX", null);
                        entry.y = getEntityProperty(e, "CBodyComponent.m_cellY", null);
                        //System.err.format("%s, %s\n", entry.x, entry.y);
                        //get the hero's entity name, ex: CDOTA_Hero_Zuus
                        entry.unit = e.getDtClass().getDtName();
                        entry.hero_id = hero;
                    }
                    es.output(entry);

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

    public void run(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        new SimpleRunner(new InputStreamSource(System.in)).runWith(this);
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.format("total time taken: %s\n", (tMatch) / 1000.0);
    }

    public static void main(String[] args) throws Exception {
        new Main().run(args);
    }
}
