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
	HashMap<Integer, Integer> slot_to_hero = new HashMap<Integer, Integer>();
	HashMap<Long, Integer> steamid_to_slot = new HashMap<Long, Integer>();
	float nextInterval = 0;
	Integer time = 0;
	int numPlayers = 10;
	EventStream es = new EventStream();
	//Set<Integer> seenEntities = new HashSet<Integer>();
	
	//@OnMessage(GeneratedMessage.class)
	public void onMessage(Context ctx, GeneratedMessage message) {
		System.err.println(message.getClass().getName());
		System.out.println(message.toString());
	}
	
	/*
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
	*/

	@OnMessage(CDOTAUserMsg_LocationPing.class)
	public void onPlayerPing(Context ctx, CDOTAUserMsg_LocationPing message){
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
		//entry.key = String.valueOf(message.getOrderType());
		es.output(entry);
	}
	
	@OnMessage(CDOTAUserMsg_ChatEvent.class)
	public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
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
		//test dump entity
		/*
		int ind = 0;
		while(ind<1000){
			try{
		System.err.println(ctx.getProcessor(Entities.class).getByIndex(ind).getDtClass().getDtName());
			}
			catch(Exception e){
				System.err.println(e);
			}
		ind++;
		}
		*/
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
		time = Math.round(cle.getTimestamp());
		String type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType()).name();
		if (true){
			//create a new entry
			Entry entry = new Entry(time);
			entry.type="combat_log";
			//entry.subtype=String.valueOf(cle.getType());
			entry.subtype = type;
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
			if (type=="DOTA_COMBATLOG_PURCHASE"){
				entry.valuename=cle.getValueName();
			}
			//TODO re-enable combat log when entities are debugged
			//es.output(entry);
		}

		if (type == "DOTA_COMBATLOG_GAME_STATE") {
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
			Integer x = (Integer)getEntityProperty(e, "CBodyComponent.m_cellX", null);
			Integer y = (Integer)getEntityProperty(e, "CBodyComponent.m_cellY", null);
			Integer[] pos = {x,y};
			entry.type = isObserver ? "obs" : "sen";
			entry.key = Arrays.toString(pos);
			//System.err.println(entry.key);
			Integer owner = (Integer)getEntityProperty(e, "m_hOwnerEntity", null);
			Entity ownerEntity = ctx.getProcessor(Entities.class).getByHandle(owner);
			entry.slot = ownerEntity!=null ? (Integer)getEntityProperty(ownerEntity, "m_iPlayerID", null) : null;
			//2/3 radiant/dire
			//entry.team = e.getProperty("m_iTeamNum");
			es.output(entry);
		}
	}

	@UsesEntities
	@OnTickStart
	public void onTickStart(Context ctx, boolean synthetic){
		//s1 DT_DOTAGameRulesProxy
		Entity grp = ctx.getProcessor(Entities.class).getByDtName("CDOTAGamerulesProxy");
		if (grp!=null){
	        //System.err.println(grp);
	        //dota_gamerules_data.m_iGameMode = 22
			//dota_gamerules_data.m_unMatchID64 = 1193091757
	        time = Math.round((float)getEntityProperty(grp, "m_pGameRules.m_fGameTime", null));
		}
		if (time >= nextInterval){
			
			Entity pr = ctx.getProcessor(Entities.class).getByDtName("CDOTA_PlayerResource");
			Entity dData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataDire");
			Entity rData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataRadiant");
			
			if (pr!=null){
				//System.err.println(pr);
				int half = numPlayers / 2;
				
				for (int i = 0; i < numPlayers; i++) {
					Entry entry = new Entry(time);
					entry.type = "interval";
					entry.slot = i;
					
					Entity e = i < half ? dData : rData;
					
					entry.gold = (Integer) getEntityProperty(e, "m_vecDataTeam.%i.m_iTotalEarnedGold", i % half);
					entry.lh = (Integer) getEntityProperty(e, "m_vecDataTeam.%i.m_iLastHitCount", i % half);
					entry.xp = (Integer) getEntityProperty(e, "m_vecDataData.%i.m_iTotalEarnedXP", i % half);	
					entry.stuns=(Float)getEntityProperty(e, "m_vecDataTeam.%i.m_fStuns", i % half);	
				
					Integer hero = (Integer)getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_nSelectedHeroID", i);
					Long steamid = (Long)getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerSteamID", i);
					int handle = (Integer)getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_hSelectedHero", i);
					//booleans to check at endgame
					//m_bHasPredictedVictory.0000
					//m_bVoiceChatBanned.0000
					//m_bHasRandomed.0000
					//m_bHasRepicked.0000
					
					//can do all these stats with each playerresource interval for graphs?
					//m_iKills.0000
					//m_iAssists.0000
					//m_iDeaths.0000
					
					//gem, rapier time?
					//TODO: https://github.com/yasp-dota/yasp/issues/333
					//need to dump inventory items for each player and possibly keep track of item entity handles
					
					//time dead, count number of intervals where this value is >0?
					//m_iRespawnSeconds.0000
					
					if (hero>0 && (!slot_to_hero.containsKey(i) || !slot_to_hero.get(i).equals(hero))){
						//hero_to_slot.put(hero, i);
						slot_to_hero.put(i, hero);
						Entry entry2 = new Entry(time);
						entry2.type="hero_log";
						entry2.slot=i;
						entry2.key=String.valueOf(hero);
						es.output(entry2);
					}
					steamid_to_slot.put(steamid, i);
					//get the player's controlled hero's coordinates
					Entity e = ctx.getProcessor(Entities.class).getByHandle(handle);
					if (e!=null){
						System.err.println(e);
						entry.x=(Integer)getEntityProperty(e, "m_cellX", null);
						entry.y=(Integer)getEntityProperty(e, "m_cellY", null);
					}
					es.output(entry);

			}
			nextInterval += INTERVAL;
		}
	}
	}
    
    public <T> T getEntityProperty(Entity e, String property, Integer idx){
    	if (idx!=null){
    		property = property.replace("%i", Util.arrayIdxToString(idx));
    	}
    	System.err.println(property);
    	FieldPath fp = e.getDtClass().getFieldPathForName(property);
    	//fp.path[0] += (index == null) ? 0 : index;
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
