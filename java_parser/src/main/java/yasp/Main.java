package yasp;
import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.reader.OnTickEnd;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.InputStreamSource;
//TODO support both s1 and s2?
import skadistats.clarity.wire.s1.proto.S1UserMessages.CUserMsg_SayText2;
import skadistats.clarity.wire.s2.proto.S2UserMessages.CUserMessageSayText2;
//s1 chat_event, spectatorplayerclick, locationping have same names as s2 class, but different package
import skadistats.clarity.wire.s1.proto.DotaUsermessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.s1.proto.DotaUsermessages.CDOTAUserMsg_LocationPing;
import skadistats.clarity.wire.s1.proto.DotaUsermessages.CDOTAUserMsg_SpectatorPlayerClick;
import skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_LocationPing;
import skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_SpectatorPlayerClick;
import skadistats.clarity.wire.common.proto.Demo.CDemoFileInfo;
import skadistats.clarity.wire.common.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
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
	HashMap<Integer, Integer> slot_to_hero = new HashMap<Integer, Integer>();
	HashMap<Long, Integer> steamid_to_slot = new HashMap<Long, Integer>();
	float nextInterval = 0;
	Integer time = 0;
	int numPlayers = 10;
	EventStream es = new EventStream();
	Set<Integer> seenEntities = new HashSet<Integer>();
	Integer lhIdx;
	Integer xpIdx;
	Integer goldIdx;
	Integer heroIdx;
	Integer stunIdx;
	Integer handleIdx;
	Integer nameIdx;
	Integer steamIdx;
	boolean initialized = false;
	boolean grpInit = false;
	Integer timeIdx;

	//@OnMessage(GeneratedMessage.class)
	public void onMessage(Context ctx, GeneratedMessage message) {
		System.err.println(message.getClass().getName());
		System.out.println(message.toString());
	}
	
	//@OnMessage(CDOTAUserMsg_SpectatorPlayerClick.class)
	public void onPlayerClick(Context ctx, CDOTAUserMsg_SpectatorPlayerClick message){
		Entry entry = new Entry(time);
		entry.type = "clicks";
		//TODO need to get the entity by index, and figure out the owner entity, then figure out the player controlling
		//assumes all clicks are made by the controlling player
		entry.slot = (Integer)message.getEntindex()-2;
		entry.key = String.valueOf(message.getOrderType());
		//theres also target_index
		es.output(entry);
	}

	@OnMessage(CDOTAUserMsg_LocationPing.class)
	public void onPlayerPingS1(Context ctx, CDOTAUserMsg_LocationPing message){
		Entry entry = new Entry(time);
		entry.type = "pings";
		Integer player1=(Integer)message.getPlayerId();
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
		//skadistats.clarity.wire.proto.DotaCommonmessages.CDOTAMsg_LocationPing getLocationPing();
		//entry.key = String.valueOf(message.getOrderType());
		es.output(entry);
	}
	
	@OnMessage(skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_LocationPing.class)
	public void onPlayerPingS2(Context ctx, skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_LocationPing message){
		Entry entry = new Entry(time);
		entry.type = "pings";
		Integer player1=(Integer)message.getPlayerId();
		entry.slot = player1;
		es.output(entry);
	}
	
	@OnMessage(CDOTAUserMsg_ChatEvent.class)
	public void onChatEventS1(Context ctx, CDOTAUserMsg_ChatEvent message) {
		CDOTAUserMsg_ChatEvent u = message;
		Integer player1=(Integer)u.getPlayerid1();
		Integer player2=(Integer)u.getPlayerid2();
		Integer value = (Integer)u.getValue();
		String type = String.valueOf(u.getType());
		Entry entry = new Entry(time);
		entry.type = "chat_event";
		entry.subtype = type;
		entry.player1 = player1;
		entry.player2 = player2;
		entry.value = value;
		es.output(entry);
	}
	
	@OnMessage(skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_ChatEvent.class)
	public void onChatEventS2(Context ctx, skadistats.clarity.wire.s2.proto.S2DotaUserMessages.CDOTAUserMsg_ChatEvent message) {
		CDOTAUserMsg_ChatEvent u = message;
		Integer player1=(Integer)u.getPlayerid1();
		Integer player2=(Integer)u.getPlayerid2();
		Integer value = (Integer)u.getValue();
		String type = String.valueOf(u.getType());
		Entry entry = new Entry(time);
		entry.type = "chat_event";
		entry.subtype = type;
		entry.player1 = player1;
		entry.player2 = player2;
		entry.value = value;
		es.output(entry);
	}
	
	@OnMessage(CUserMsg_SayText2.class)
	public void onAllChatS1(Context ctx, CUserMsg_SayText2 message) {
		Entry entry = new Entry(time);
		entry.unit =  String.valueOf(message.getPrefix());
		entry.key =  String.valueOf(message.getText());
		//TODO this message has a client field, likely based on connection order.  If we can figure out how the ids are assigned we can use this to match chat messages to players
		//entry.slot = message.getClient();
		entry.type = "chat";
		es.output(entry);
	}
	
	@OnMessage(CUserMessageSayText2.class)
	public void onAllChatS2(Context ctx, CUserMessageSayText2 message) {
		System.err.println(message);
		Entry entry = new Entry(time);
		entry.unit =  String.valueOf(message.getParam1());
		entry.key =  String.valueOf(message.getParam2());
		//TODO this message has a client field, likely based on connection order.  If we can figure out how the ids are assigned we can use this to match chat messages to players
		//entry.slot = message.getClient();
		entry.type = "chat";
		es.output(entry);
	}
	
	@OnMessage(CDemoFileInfo.class)
	public void onFileInfo(Context ctx, CDemoFileInfo message){
		//load epilogue
		CDemoFileInfo info = message;
		List<CPlayerInfo> players = info.getGameInfo().getDota().getPlayerInfoList();
		for (int i = 0;i<players.size();i++) {
			Entry entry = new Entry();
			entry.type="name";
			entry.key = players.get(i).getPlayerName();
			entry.slot = steamid_to_slot.get(players.get(i).getSteamid());
			es.output(entry);
		}
		for (int i = 0;i<players.size();i++) {
			Entry entry = new Entry();
			entry.type="steam_id";
			entry.key = String.valueOf(players.get(i).getSteamid());
			entry.slot = steamid_to_slot.get(players.get(i).getSteamid());
			es.output(entry);
		}
		if (true){
			Entry entry = new Entry();
			entry.type="match_id";
			entry.value = info.getGameInfo().getDota().getMatchId();
			es.output(entry);
		}
		if (true){
			//emit epilogue event
			Entry entry = new Entry();
			entry.type="epilogue";
			entry.key = new Gson().toJson(info);
			es.output(entry);
		}
	}

	@OnCombatLogEntry
	public void onCombatLogEntry(Context ctx, CombatLog.Entry cle) {
		//System.err.format("stun: %s, slow: %s\n", cle.getStunDuration(), cle.getSlowDuration());
		//System.err.format("x: %s, y: %s\n", cle.getLocationX(), cle.getLocationY());
		//System.err.format("modifier_duration: %s, last_hits: %s, att_team: %s, target_team: %s, obs_placed: %s\n",cle.getModifierDuration(), cle.getAttackerTeam(), cle.getTargetTeam(), cle.getObsWardsPlaced());
		//sets global time to time in this combat log entry
		time = Math.round(cle.getTimestamp());
		
		if (true){
			//create a new entry
			Entry entry = new Entry(time);
			entry.type="combat_log";
			//entry.subtype=String.valueOf(cle.getType());
			entry.subtype = skadistats.clarity.wire.common.proto.DotaUsermessagesCommon.DOTA_COMBATLOG_TYPES.valueOf(cle.getType()).name();
			//translate the fields using string tables if necessary (get*Name methods)
			entry.attackername=cle.getAttackerName();
			entry.targetname=cle.getTargetName();
			entry.sourcename=cle.getSourceName();
			entry.targetsourcename=cle.getTargetSourceName();
			entry.inflictor=cle.getInflictorName();
			entry.gold_reason=cle.getGoldReason();
			entry.xp_reason=cle.getXpReason();
			entry.attackerhero=cle.isAttackerHero();
			entry.targethero=cle.isTargetHero();
			entry.attackerillusion=cle.isAttackerIllusion();
			entry.targetillusion=cle.isTargetIllusion();
			entry.value=cle.getValue();
			//value may be out of bounds in string table, we can only get valuename if a purchase (type 11)
			if (entry.subtype=="DOTA_COMBATLOG_PURCHASE"){
				entry.valuename=cle.getValueName();
			}
			es.output(entry);
		}

		if (entry.subtype == "DOTA_COMBATLOG_GAME_STATE") {
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


	//@UsesEntities
	//@OnTickStart
	public void onTickStart(Context ctx, boolean synthetic){
		Entity grp = ctx.getProcessor(Entities.class).getByDtName("DT_DOTAGamerulesProxy");
		if (grp!=null){
		if (!grpInit){
			//we can get the match id/gamemode at the beginning of a match
			//dota_gamerules_data.m_iGameMode = 22
			//dota_gamerules_data.m_unMatchID64 = 1193091757
			//System.err.println(grp);
			//this should be game clock time (pauses don't increment it)
			timeIdx = grp.getDtClass().getPropertyIndex("dota_gamerules_data.m_fGameTime");
			grpInit = true;
		}
        time = Math.round((float)grp.getState()[timeIdx]);
		}
		if (time >= nextInterval){
			Entity pr = ctx.getProcessor(Entities.class).getByDtName("DT_DOTA_PlayerResource");
			if (pr!=null){
				if (!initialized) {
					//dump playerresource for inspection
					//System.err.println(pr);
					lhIdx = pr.getDtClass().getPropertyIndex("m_iLastHitCount.0000");
					xpIdx = pr.getDtClass().getPropertyIndex("EndScoreAndSpectatorStats.m_iTotalEarnedXP.0000");
					goldIdx = pr.getDtClass().getPropertyIndex("EndScoreAndSpectatorStats.m_iTotalEarnedGold.0000");
					heroIdx = pr.getDtClass().getPropertyIndex("m_nSelectedHeroID.0000");
					stunIdx = pr.getDtClass().getPropertyIndex("m_fStuns.0000");
					handleIdx = pr.getDtClass().getPropertyIndex("m_hSelectedHero.0000");
					nameIdx = pr.getDtClass().getPropertyIndex("m_iszPlayerNames.0000");
					steamIdx = pr.getDtClass().getPropertyIndex("m_iPlayerSteamIDs.0000");
					//TODO: slow data can be output to console, but not in replay?
					//Integer slowIdx = ps.getDtClass().getPropertyIndex("m_fSlows.0000");
					
					//booleans to check at endgame
					//Integer victoryIdx = ps.getDtClass().getPropertyIndex("m_bHasPredictedVictory.0000");
					//m_bVoiceChatBanned.0000
					//m_bHasRandomed.0000
					//m_bHasRepicked.0000
					
					//can do all these stats with each playerresource interval?
					//m_iKills.0000
					//m_iAssists.0000
					//m_iDeaths.0000
					
					//gem, rapier time?
					//TODO: https://github.com/yasp-dota/yasp/issues/333
					//need to dump inventory items for each player and possibly keep track of item entity handles
					
					//time dead, count number of intervals where this value is >0?
					//m_iRespawnSeconds.0000
					initialized = true;
				}
				for (int i = 0; i < numPlayers; i++) {
					Integer hero = (Integer)pr.getState()[heroIdx+i];
					if (hero>0 && (!slot_to_hero.containsKey(i) || !slot_to_hero.get(i).equals(hero))){
						//hero_to_slot.put(hero, i);
						slot_to_hero.put(i, hero);
						Entry entry = new Entry(time);
						entry.type="hero_log";
						entry.slot=i;
						entry.key=String.valueOf(hero);
						es.output(entry);
					}
				
					Entry entry = new Entry(time);
					entry.type = "interval";
					entry.slot = i;
					entry.gold=(Integer)pr.getState()[goldIdx+i];
					entry.lh=(Integer)pr.getState()[lhIdx+i];
					entry.xp=(Integer)pr.getState()[xpIdx+i];
					entry.stuns=(Float)pr.getState()[stunIdx+i];
					Long steamid = (Long)pr.getState()[steamIdx+i];
					steamid_to_slot.put(steamid, i);
					int handle = (Integer)pr.getState()[handleIdx+i];
					Entity e = ctx.getProcessor(Entities.class).getByHandle(handle);
					if (e!=null){
						entry.x=(Integer)e.getProperty("m_cellX");
						entry.y=(Integer)e.getProperty("m_cellY");
					}
					es.output(entry);
				}
			}
			//log any new wards placed
			//TODO: deduplicate code
			Iterator<Entity> obs = ctx.getProcessor(Entities.class).getAllByDtName("DT_DOTA_NPC_Observer_Ward");
			while (obs.hasNext()){
				Entity e = obs.next();
				Integer handle = e.getHandle();
				if (!seenEntities.contains(handle)){
					Entry entry = new Entry(time);
					Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
					entry.type = "obs";
					entry.key = Arrays.toString(pos);
					Integer owner = (Integer)e.getProperty("m_hOwnerEntity");
					Entity ownerEntity = ctx.getProcessor(Entities.class).getByHandle(owner);
					entry.slot = ownerEntity!=null ? (Integer)ownerEntity.getProperty("m_iPlayerID") : null;
					//2/3 radiant/dire
					//entry.team = e.getProperty("m_iTeamNum");
					es.output(entry);
					seenEntities.add(handle);
				}
			}
			Iterator<Entity> sen = ctx.getProcessor(Entities.class).getAllByDtName("DT_DOTA_NPC_Observer_Ward_TrueSight");
			while (sen.hasNext()){
				Entity e = sen.next();
				Integer handle = e.getHandle();
				if (!seenEntities.contains(handle)){
					Entry entry = new Entry(time);
					Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
					entry.type="sen";
					entry.key = Arrays.toString(pos);
					Integer owner = (Integer)e.getProperty("m_hOwnerEntity");
					Entity ownerEntity = ctx.getProcessor(Entities.class).getByHandle(owner);
					entry.slot = ownerEntity!=null ? (Integer)ownerEntity.getProperty("m_iPlayerID") : null;
					//entry.team = e.getProperty("m_iTeamNum");
					es.output(entry);
					seenEntities.add(handle);
				}
			}
			nextInterval += INTERVAL;
		}
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
