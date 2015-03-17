package yasp;

import com.dota2.proto.Netmessages;
import com.dota2.proto.Usermessages;
import com.google.protobuf.GeneratedMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import skadistats.clarity.Clarity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import skadistats.clarity.processor.gameevents.OnGameEvent;
import skadistats.clarity.processor.gameevents.CombatLog;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.Runner;
import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;
import com.dota2.proto.Demo.CDemoFileInfo;
import com.dota2.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Arrays;
import com.google.gson.Gson;
//import skadistats.clarity.processor.entities.OnEntity;

@UsesEntities
public class Main {
	float INTERVAL = 1;
	HashMap<Integer, Integer> slot_to_hero = new HashMap<Integer, Integer>();
	HashMap<Long, Integer> steamid_to_slot = new HashMap<Long, Integer>();
	//float nextInterval = 0;
	Integer time = 0;
	int numPlayers = 10;
	Log log = new Log();
	Set<Integer> seenEntities = new HashSet<Integer>();
/*
    @OnMessage(GeneratedMessage.class)
    public void onMessage(Context ctx, GeneratedMessage message) {
        if (message instanceof Netmessages.CSVCMsg_VoiceData) {
            return;
        }
        System.out.println(message.getClass().getName());
        System.out.println(message.toString());
    }

    @OnMessage(Usermessages.CUserMsg_SayText2.class)
    public void onAllChat(Context ctx, Usermessages.CUserMsg_SayText2.class message) {
        log.output(message.getText());
    }

        @OnMessage(Usermessages.CDOTAUserMsg_ChatEvent.class)
    public void onChatEvent(Context ctx, Usermessages.CDOTAUserMsg_ChatEvent.class message) {
        log.output(message);
    }
        @OnEntity
    public void onEntity(Context ctx, Entity e) {
        System.out.println(e);
    }
        */

	   @OnCombatLogEntry
	    public void onCombatLogEntry(Context ctx, CombatLogEntry cle) {
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
				log.output(entry);
				break;
			case 1:
				//healing
               entry.unit = cle.getAttackerNameCompiled();
               entry.key = cle.getTargetNameCompiled();
               entry.value = cle.getValue();
               entry.type = "healing";
               log.output(entry);
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
				log.output(entry);
				break;
			case 5:
				//ability use
				entry.unit = cle.getAttackerNameCompiled();
				entry.key = cle.getInflictorName();
				entry.type = "ability_uses";
				log.output(entry);
				break;
			case 6:
				//item use
				entry.unit = cle.getAttackerNameCompiled();
				entry.key = cle.getInflictorName();
				entry.type = "item_uses";
				log.output(entry);
				break;
			case 8:
				//gold gain/loss
				entry.key = String.valueOf(cle.getGoldReason());
				entry.unit = cle.getTargetNameCompiled();
				entry.value = cle.getValue();
				entry.type = "gold_reasons";
				log.output(entry);
				break;
			case 9:
				//state
				//System.err.println(cle.getValue());
				//todo there is a new type 7 that causes parser to crash on some replays
				String state =  GameRulesStateType.values()[cle.getValue() - 1].toString();
				entry.type = "state";
				entry.key = state;
				entry.value = Integer.valueOf(time);
				log.output(entry);
				break;
			case 10:
				//xp gain
				entry.unit = cle.getTargetNameCompiled();
				entry.value = cle.getValue();
				//entry.key = String.valueOf(cle.getXpReason());
				entry.type = "xp_reasons";
				log.output(entry);
				break;
			case 11:
				//purchase
				entry.unit = cle.getTargetNameCompiled();
				//entry.key = cle.getValueName();
				entry.type = "purchase";
				log.output(entry);
				break;
			case 12:
				//buyback
				entry.slot = cle.getValue();
				entry.type = "buyback_log";
				log.output(entry);
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
				log.output(entry);
				break;
			}
	   }

    public void run(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();
        Context ctx = new Runner().runWith(System.in, this);
        //summary(ctx);
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.format("total time taken: %s\n", (tMatch) / 1000.0);
    }

    public static void main(String[] args) throws Exception {
        new Main().run(args);
    }
}

/*
	  private void summary(Context ctx) throws UnsupportedEncodingException {
        class ColDef {
            String columnName;
            String propertyName;
            List<String> values;
            int width;
            public ColDef(String columnName, String propertyName) {
                this.columnName = columnName;
                this.propertyName = propertyName;
                this.width = columnName.length();
            }
        }

        ColDef[] columns = new ColDef[] {
            new ColDef("Name", "m_iszPlayerNames"),
            new ColDef("Level", "m_iLevel"),
            new ColDef("K", "m_iKills"),
            new ColDef("D", "m_iDeaths"),
            new ColDef("A", "m_iAssists"),
            new ColDef("Gold", "EndScoreAndSpectatorStats.m_iTotalEarnedGold"),
            new ColDef("LH", "m_iLastHitCount"),
            new ColDef("DN", "m_iDenyCount"),
        };

        Entity ps = ctx.getProcessor(Entities.class).getByDtName("DT_DOTA_PlayerResource");

        for (ColDef c : columns) {
            c.values = new ArrayList<>();
            int baseIndex = ps.getDtClass().getPropertyIndex(c.propertyName + ".0000");
            for (int p = 0; p < 10; p++) {
                String v = new String(ps.getState()[baseIndex + p].toString().getBytes("ISO-8859-1"));
                c.values.add(v);
                c.width = Math.max(c.width, v.length());
            }
        }

        StringBuffer buf = new StringBuffer();
        String space = "                                                                  ";
        for (ColDef c : columns) {
            buf.append(c.columnName);
            buf.append(space, 0, c.width - c.columnName.length() + 2);
        }
        System.out.println(buf);
        for (int p = 0; p < 10; p++) {
            buf.setLength(0);
            for (ColDef c : columns) {
                buf.append(c.values.get(p));
                buf.append(space, 0, c.width - c.values.get(p).length() + 2);
            }
            System.out.println(buf);
        }
    }

*/
    		    /*
    		public static void finish(match){
    		    			//load endgame stats
			for (int i = 0; i < numPlayers; i++) {
				String stuns = String.valueOf(pr.getState()[stunIdx+i]);
				Long steamid = (Long)pr.getState()[steamIdx+i];
				steamid_to_slot.put(steamid, i);
				Entry entry = new Entry();
				entry.slot=i;
				entry.type="stuns";
				entry.key=stuns;
				log.output(entry);
			}

			//load epilogue
			CDemoFileInfo info = match.getFileInfo();
			List<CPlayerInfo> players = info.getGameInfo().getDota().getPlayerInfoList();
			for (int i = 0;i<players.size();i++) {
				Entry entry = new Entry();
				entry.type="name";
				entry.key = players.get(i).getPlayerName();
				entry.slot = steamid_to_slot.get(players.get(i).getSteamid());
				log.output(entry);
			}
			Entry entry = new Entry();
			entry.type="match_id";
			entry.value = info.getGameInfo().getDota().getMatchId();
			log.output(entry);

//emit epilogue event
			Entry entry = new Entry();
			entry.type="epilogue";
			entry.key = new Gson().toJson(info.getGameInfo().getDota());
			log.output(entry);
			
//flush the log if it was buffered	
			log.flush();
	}
	
			while(iter.hasNext()) {
				iter.next().apply(match);
				time = (int) match.getGameTime();
				pr = match.getPlayerResource();
				EntityCollection ec = match.getEntities();

				if (!initialized) {
					combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog");
					ctx = new CombatLogContext(match.getStringTables().forName("CombatLogNames"), combatLogDescriptor);
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
						log.output(entry);
					}
				}
				
				//output a player resource summary every second
				if (trueTime > nextInterval){
				    for (int i = 0; i < numPlayers; i++) {
				    	Entry entry = new Entry(time);
				    	entry.type = "interval";
				    	entry.slot = i;
                    	entry.gold=(Integer)pr.getState()[goldIdx+i];
						entry.lh=(Integer)pr.getState()[lhIdx+i];
						entry.xp=(Integer)pr.getState()[xpIdx+i];
						int handle = (Integer)pr.getState()[handleIdx+i];
                    	Entity e = ec.getByHandle(handle);
						if (e!=null){
							entry.x=(Integer)e.getProperty("m_cellX");
							entry.y=(Integer)e.getProperty("m_cellY");
						}
						log.output(entry);
					}
					nextInterval += INTERVAL;
				}

//log any new wards placed
                //todo deduplicate code
                Iterator<Entity> obs = ec.getAllByDtName("DT_DOTA_NPC_Observer_Ward");
                while (obs.hasNext()){
                Entity e = obs.next();
                Integer handle = e.getHandle();
                if (!seenEntities.contains(handle)){
                	Entry entry = new Entry(time);
					Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
					entry.type = "obs";
                    entry.key = Arrays.toString(pos);
                    Integer owner = (Integer)e.getProperty("m_hOwnerEntity");
                    Entity ownerEntity = ec.getByHandle(owner);
                    entry.slot = ownerEntity.getProperty("m_iPlayerID");
                    //entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
                    log.output(entry);
                	seenEntities.add(handle);
                }
                }
                Iterator<Entity> sen = ec.getAllByDtName("DT_DOTA_NPC_Observer_Ward_TrueSight");
                while (sen.hasNext()){
                Entity e = sen.next();
                Integer handle = e.getHandle();
                if (!seenEntities.contains(handle)){
                	Entry entry = new Entry(time);
					Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
					entry.type="sen";
                    entry.key = Arrays.toString(pos);
                    Integer owner = (Integer)e.getProperty("m_hOwnerEntity");
                    Entity ownerEntity = ec.getByHandle(owner);
                    entry.slot = ownerEntity.getProperty("m_iPlayerID");
                    //entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
                    log.output(entry);
                    seenEntities.add(handle);
                }
                }

//parse chat events, rune pickups, all chat
				for (UserMessage u : match.getUserMessages()) {
					String name = u.getName();
					if (name.equals("CDOTAUserMsg_ChatEvent")){
                        Integer player1=(Integer)u.getProperty("playerid_1");
                        Integer player2=(Integer)u.getProperty("playerid_2");
                        String value = String.valueOf(u.getProperty("value"));
                        String type = String.valueOf(u.getProperty("type"));
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
                        	log.output(entry);
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
                        //System.err.format("%s %s%n", time, u);
                        }
					}
					else if (name.equals("CUserMsg_SayText2")){
						Entry entry = new Entry(time);
						entry.unit =  String.valueOf(u.getProperty("prefix"));
						entry.key =  String.valueOf(u.getProperty("text"));
						entry.type = "chat";
						log.output(entry);
					}
					else if (name.equals("CDOTAUserMsg_SpectatorPlayerClick")){
						System.err.format("%s %s\n", time, u);
					}
					else{
						//System.err.format("%s %s\n", time, u);
					}
				}
			}
			*/
			//detect rune spawns
							/*
                Iterator<Entity> runes = ec.getAllByDtName("DT_DOTA_Item_Rune");
                while (runes.hasNext()){
                Entity e = runes.next();
                Integer handle = e.getHandle();
                if (!seenEntities.contains(handle)){
                System.err.format("rune: time:%s,x:%s,y:%s,type:%s\n", time, e.getProperty("m_iRuneType"), e.getProperty("m_cellX"), e.getProperty("m_cellY"));
                seenEntities.add(handle);
                }
                }
                */