package yasp;
import skadistats.clarity.wire.proto.Netmessages;
import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import skadistats.clarity.processor.gameevents.OnGameEvent;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.reader.OnTickEnd;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.wire.proto.Usermessages.CUserMsg_SayText2;
import skadistats.clarity.wire.proto.DotaUsermessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.proto.DotaUsermessages.CDOTAUserMsg_SpectatorPlayerClick;
import skadistats.clarity.wire.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import skadistats.clarity.wire.proto.Demo.CDemoFileInfo;
import skadistats.clarity.wire.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Arrays;
import com.google.gson.Gson;

@UsesEntities
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

	//@OnMessage(GeneratedMessage.class)
	public void onMessage(Context ctx, GeneratedMessage message) {
		if (message instanceof Netmessages.CSVCMsg_VoiceData) {
			return;
		}
		System.err.println(message.getClass().getName());
		System.out.println(message.toString());
	}
	
	//@OnMessage(CDOTAUserMsg_SpectatorPlayerClick.class)
	public void onPlayerClick(Context ctx, CDOTAUserMsg_SpectatorPlayerClick message){
		Entry entry = new Entry(time);
		entry.type = "clicks";
		//todo need to get the entity by index, and figure out the owner entity, then figure out the player controlling
		//assumes all clicks are made by the controlling player
		entry.slot = (Integer)message.getEntindex()-2;
		entry.key = String.valueOf(message.getOrderType());
		//theres also target_index
		es.output(entry);
	}

	@OnMessage(CDOTAUserMsg_ChatEvent.class)
	public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
		CDOTAUserMsg_ChatEvent u = message;
		Integer player1=(Integer)u.getPlayerid1();
		Integer player2=(Integer)u.getPlayerid2();
		String value = String.valueOf(u.getValue());
		String type = String.valueOf(u.getType());
		if (type.equals("CHAT_MESSAGE_HERO_KILL")){
			Entry entry = new Entry(time);
			entry.type = "chat_hero_kill";
			//player2 killed player 1
			//subsequent players assisted
			entry.slot=player2;
			entry.key=String.valueOf(player1);
			//es.output(entry);
		}
		else if (type.equals("CHAT_MESSAGE_RUNE_PICKUP") || type.equals("CHAT_MESSAGE_RUNE_BOTTLE")){
			Entry entry = new Entry(time);
			entry.type=type.equals("CHAT_MESSAGE_RUNE_PICKUP") ? "runes" : "runes_bottled";
			entry.slot=player1;
			entry.key=value;
			es.output(entry);
		}             
		else if (type.equals("CHAT_MESSAGE_BUYBACK")){
			//System.err.format("%s,%s%n", time, u);
		}
		else if (type.equals("CHAT_MESSAGE_RANDOM")){
		}
		else if (type.equals("CHAT_MESSAGE_GLYPH_USED")){
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
		/*
	CHAT_MESSAGE_COURIER_LOST = 10;
	CHAT_MESSAGE_COURIER_RESPAWNED = 11;
	CHAT_MESSAGE_GLYPH_USED = 12;
	CHAT_MESSAGE_PAUSED = 34;
	CHAT_MESSAGE_UNPAUSE_COUNTDOWN = 35;
	CHAT_MESSAGE_UNPAUSED = 36;
	CHAT_MESSAGE_DENIED_AEGIS = 51;
	CHAT_MESSAGE_AEGIS_STOLEN = 53;
	*/
		else{
			//System.err.format("%s %s\n", time, u);
		}
	}
	@OnMessage(CUserMsg_SayText2.class)
	public void onAllChat(Context ctx, CUserMsg_SayText2 message) {
		Entry entry = new Entry(time);
		entry.unit =  String.valueOf(message.getPrefix());
		entry.key =  String.valueOf(message.getText());
		entry.type = "chat";
		es.output(entry);
	}
	@OnMessage(CDemoFileInfo.class)
	public void onFileInfo(Context ctx, CDemoFileInfo message){
		Entity ps = ctx.getProcessor(Entities.class).getByDtName("DT_DOTA_PlayerResource");
		//System.err.println(ps);
		//load endgame stats
		for (int i = 0; i < numPlayers; i++) {
			Long steamid = (Long)ps.getState()[steamIdx+i];
			steamid_to_slot.put(steamid, i);
			if (stunIdx!=null){
			String stuns = String.valueOf(ps.getState()[stunIdx+i]);
			Entry entry = new Entry();
			entry.slot=i;
			entry.type="stuns";
			entry.key=stuns;
			es.output(entry);
			}
		}

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
			entry.key = new Gson().toJson(info.getGameInfo().getDota());
			es.output(entry);
		}
	}

	@OnYASPCombatLogEntry
	public void onCombatLogEntry(Context ctx, YASPCombatLog.Entry cle) {
		time = Math.round(cle.getTimestamp());
		Entry entry = new Entry(time);
		switch(cle.getType()) {
		case 0:
			//damage
			entry.unit = cle.getAttackerNameCompiled();
			entry.key = cle.getTargetNameCompiled();
			entry.target_hero = cle.isTargetHero();
			entry.inflictor = cle.getInflictorName();
			entry.target_illusion = cle.isTargetIllusion();
			entry.value = cle.getValue();
			entry.type = "damage";
			es.output(entry);
			break;
		case 1:
			//healing
			entry.unit = cle.getAttackerNameCompiled();
			entry.key = cle.getTargetNameCompiled();
			entry.value = cle.getValue();
			entry.type = "healing";
			es.output(entry);
			break;
		case 2:
			//gain buff/debuff
			entry.type = "modifier_applied";
			entry.unit = cle.getAttackerNameCompiled(); //source of buff
			entry.key = cle.getInflictorName(); //the buff
			//todo do something with buff target
			//String unit2 = cle.getTargetNameCompiled(); //target of buff
			es.output(entry);
			break;
		case 3:
			//lose buff/debuff
			entry.type = "modifier_lost";
			//todo do something with modifier lost events
			// log.info("{} {} loses {} buff/debuff", time, cle.getTargetNameCompiledCompiled(), cle.getInflictorName() );
			break;
		case 4:
			//kill
			entry.unit = cle.getAttackerNameCompiled();
			entry.key = cle.getTargetNameCompiled();
			entry.target_illusion = cle.isTargetIllusion();
			entry.type = "kills";
			es.output(entry);
			break;
		case 5:
			//ability use
			entry.unit = cle.getAttackerNameCompiled();
			entry.key = cle.getInflictorName();
			entry.type = "ability_uses";
			es.output(entry);
			break;
		case 6:
			//item use
			entry.unit = cle.getAttackerNameCompiled();
			entry.key = cle.getInflictorName();
			entry.type = "item_uses";
			es.output(entry);
			break;
		case 8:
			//gold gain/loss
			entry.key = String.valueOf(cle.getGoldReason());
			entry.unit = cle.getTargetNameCompiled();
			entry.value = cle.getValue();
			entry.type = "gold_reasons";
			es.output(entry);
			break;
		case 9:
			//state
			//System.err.println(cle.getValue());
			String state =  GameRulesStateType.values().length >= cle.getValue() ? GameRulesStateType.values()[cle.getValue() - 1].toString() : String.valueOf(cle.getValue()-1);
			entry.type = "state";
			entry.key = state;
			entry.value = Integer.valueOf(time);
			es.output(entry);
			break;
		case 10:
			//xp gain
			entry.unit = cle.getTargetNameCompiled();
			entry.value = cle.getValue();
			entry.key = String.valueOf(cle.getXpReason());
			entry.type = "xp_reasons";
			es.output(entry);
			break;
		case 11:
			//purchase
			entry.unit = cle.getTargetNameCompiled();
			entry.key = cle.getValueName();
			entry.type = "purchase";
			es.output(entry);
			break;
		case 12:
			//buyback
			entry.slot = cle.getValue();
			entry.type = "buyback_log";
			es.output(entry);
			break;
		case 13:
			entry.type = "ability_trigger";
			entry.unit = cle.getAttackerNameCompiled(); //triggered?
			entry.key = cle.getInflictorName();
			//entry.unit = cle.getTargetNameCompiled(); //triggerer?
			//log.output(entry);
			break;
		default:
			DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
			entry.type = type.name();
			System.err.format("%s (%s): %s\n", type.name(), type.ordinal(), cle.getGameEvent());
			es.output(entry);
			break;
		}
	}

	@UsesEntities
	@OnTickStart
	public void onTick(Context ctx){
		Entity grp = ctx.getProcessor(Entities.class).getByDtName("DT_DOTAGamerulesProxy");
        time = grp != null ? Math.round((float)grp.getProperty("dota_gamerules_data.m_fGameTime")) : -1; 
		if (time >= nextInterval){
			Entity pr = ctx.getProcessor(Entities.class).getByDtName("DT_DOTA_PlayerResource");
			if (pr!=null){
				if (!initialized) {
					lhIdx = pr.getDtClass().getPropertyIndex("m_iLastHitCount.0000");
					xpIdx = pr.getDtClass().getPropertyIndex("EndScoreAndSpectatorStats.m_iTotalEarnedXP.0000");
					goldIdx = pr.getDtClass().getPropertyIndex("EndScoreAndSpectatorStats.m_iTotalEarnedGold.0000");
					heroIdx = pr.getDtClass().getPropertyIndex("m_nSelectedHeroID.0000");
					stunIdx = pr.getDtClass().getPropertyIndex("m_fStuns.0000");
					handleIdx = pr.getDtClass().getPropertyIndex("m_hSelectedHero.0000");
					nameIdx = pr.getDtClass().getPropertyIndex("m_iszPlayerNames.0000");
					steamIdx = pr.getDtClass().getPropertyIndex("m_iPlayerSteamIDs.0000");
		Integer stunIdx = pr.getDtClass().getPropertyIndex("m_fStuns.0000");
		Integer steamIdx = pr.getDtClass().getPropertyIndex("m_iPlayerSteamIDs.0000");
		//slow data can be output to console, but not in replay?
		//Integer slowIdx = ps.getDtClass().getPropertyIndex("m_fSlows.0000");
		//Integer victoryIdx = ps.getDtClass().getPropertyIndex("m_bHasPredictedVictory.0000");
		
		//can do all these stats over time?
		//m_iKills.0000
		//m_iAssists.0000
		//m_iDeaths.0000
		//m_iTowerKills.0000
		//m_iRoshanKills.0000
		//m_iNearbyCreepDeathCount.0000
		//m_iMetaLevel.0000
		//m_iMetaExperience.0000
		//m_iMetaExperienceAwarded.0000
		
		//more endgame
		//m_bVoiceChatBanned.0000
		//m_bHasRandomed.0000
		//m_bHasRepicked.0000
		
		//might want the max only
		//m_iStreak.0000
		//m_iLastHitStreak.0000
		//m_iLastHitMultikill.0000
		
		//gem, rapier time?
		//time dead
		//or check entity health value
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
			//todo deduplicate code
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
					//entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
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
					//entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
					es.output(entry);
					seenEntities.add(handle);
				}
			}
			nextInterval += INTERVAL;
		}
	}

	public void run(String[] args) throws Exception {
		long tStart = System.currentTimeMillis();
		new SimpleRunner().runWith(System.in, this);
		//flush the log if it was buffered	
		es.flush();
		long tMatch = System.currentTimeMillis() - tStart;
		System.err.format("total time taken: %s\n", (tMatch) / 1000.0);
	}

	public static void main(String[] args) throws Exception {
		new Main().run(args);
	}
}