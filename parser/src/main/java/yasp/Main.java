package yasp;
import com.dota2.proto.Netmessages;
import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import skadistats.clarity.processor.gameevents.OnGameEvent;
//import skadistats.clarity.processor.gameevents.CombatLog;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.reader.InputStreamProcessor;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.reader.OnTickEnd;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.Runner;
import com.dota2.proto.Usermessages.CUserMsg_SayText2;
import com.dota2.proto.DotaUsermessages.CDOTAUserMsg_ChatEvent;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import com.dota2.proto.Demo.CDemoFileInfo;
import com.dota2.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Arrays;
import java.io.FileInputStream;
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
    
	@OnMessage(CDOTAUserMsg_ChatEvent.class)
    public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
    	CDOTAUserMsg_ChatEvent u = message;
                        Integer player1=(Integer)u.getPlayerid1();
                        Integer player2=(Integer)u.getPlayerid2();
                        String value = String.valueOf(u.getValue());
                        String type = String.valueOf(u.getType());
                        if (type.equals("CHAT_MESSAGE_HERO_KILL")){
                    		//System.err.format("%s,%s%n", time, u);
                        }
                        else if (type.equals("CHAT_MESSAGE_BUYBACK")){
                        	//System.err.format("%s,%s%n", time, u);
                        }
                        else if (type.equals("CHAT_MESSAGE_RUNE_PICKUP") || type.equals("CHAT_MESSAGE_RUNE_BOTTLE")){
                        	Entry entry = new Entry(time);
                        	entry.type=type.equals("CHAT_MESSAGE_RUNE_PICKUP") ? "runes" : "runes_bottled";
                        	entry.slot=player1;
                        	entry.key=value;
                        	es.output(entry);
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
        	         Integer stunIdx = ps.getDtClass().getPropertyIndex("m_fStuns.0000");
        	         Integer steamIdx = ps.getDtClass().getPropertyIndex("m_iPlayerSteamIDs.0000");
        	//load endgame stats
			for (int i = 0; i < numPlayers; i++) {
				String stuns = String.valueOf(ps.getState()[stunIdx+i]);
				Long steamid = (Long)ps.getState()[steamIdx+i];
				steamid_to_slot.put(steamid, i);
				Entry entry = new Entry();
				entry.slot=i;
				entry.type="stuns";
				entry.key=stuns;
				es.output(entry);
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
        
	@OnCombatLogEntry
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
			//log.output(entry);
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
			//todo there is a new type 7 that causes parser to crash on some replays
			String state =  GameRulesStateType.values()[cle.getValue() - 1].toString();
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


@OnTickStart
public void onTick(Context ctx){
	time = ctx.getTick()/30;
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
					initialized = true;
				}
							//check hero every tick	
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
				}

				//output a player resource summary every second
				if (time > nextInterval){
				    for (int i = 0; i < numPlayers; i++) {
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
					nextInterval += INTERVAL;
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
                    entry.slot = ownerEntity.getProperty("m_iPlayerID");
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
                    entry.slot = ownerEntity.getProperty("m_iPlayerID");
                    //entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
                    es.output(entry);
                    seenEntities.add(handle);
                }
                }
}
}

	public void run(String[] args) throws Exception {
		long tStart = System.currentTimeMillis();
		new Runner().runWith(System.in, this);
		//flush the log if it was buffered	
		es.flush();
		long tMatch = System.currentTimeMillis() - tStart;
		System.err.format("total time taken: %s\n", (tMatch) / 1000.0);
	}

	public static void main(String[] args) throws Exception {
		new Main().run(args);
	}
}