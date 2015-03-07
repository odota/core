package yasp;
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
import com.dota2.proto.Demo.CGameInfo.CDotaGameInfo.CPlayerInfo;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Arrays;
import com.google.gson.Gson;

public class Main {
	public static void main(String[] args) throws Exception{
		long tStart = System.currentTimeMillis();
		float MINUTE = 60;
		float POSITION_INTERVAL = 1;
		HashMap<Integer, Integer> slot_to_hero = new HashMap<Integer, Integer>();
		HashMap<Long, Integer> steamid_to_slot = new HashMap<Long, Integer>();
		//HashMap<Integer, Integer> hero_to_slot = new HashMap<Integer,Integer>();
		//HashMap<String, Integer> name_to_slot = new HashMap<String, Integer>();
		//HashMap<Integer, Integer> ehandle_to_slot = new HashMap<Integer, Integer>();
		boolean initialized = false;
		GameEventDescriptor combatLogDescriptor = null;
		CombatLogContext ctx = null;
		int lhIdx=0;
		int xpIdx=0;
		int goldIdx=0;
		int heroIdx=0;
		int stunIdx=0;
		int handleIdx=0;
		int nameIdx=0;
		int steamIdx=0;
		int missIdx=0;
		Match match = new Match();
		Entity pr=null;
		float nextMinute = 0;
		float nextShort = 0;
		int time = 0;
		int gameZero = Integer.MAX_VALUE;
		int numPlayers = 10;
		Log log = new Log();
		Set<Integer> seenEntities = new HashSet<Integer>();
		Set<Integer> effectEntities = new HashSet<Integer>();

		if (args.length>0 && args[0].equals("-epilogue")){
			CDemoFileInfo info = Clarity.infoForStream(System.in);
			finish(tStart, log, info);
			return;
		}
			TickIterator iter = Clarity.tickIteratorForStream(System.in, CustomProfile.ENTITIES, CustomProfile.COMBAT_LOG, CustomProfile.ALL_CHAT, CustomProfile.FILE_INFO, CustomProfile.CHAT_MESSAGES);
			while(iter.hasNext()) {
				iter.next().apply(match);
				time = (int) match.getGameTime();
				int trueTime=time-gameZero;
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
				
				if (trueTime > nextMinute) {
					Entry entry = new Entry(time);
					entry.type="times";
					entry.value = trueTime;
					log.output(entry);
				}
				if (trueTime > nextMinute){
					HashMap<String, Integer> m = new HashMap<String, Integer>();
					m.put("lh", lhIdx);
					m.put("gold", goldIdx);
					m.put("xp", xpIdx);
				    for (int i = 0; i < numPlayers; i++) {
				    	for (String key : m.keySet()){
				    		Entry entry = new Entry(time);
				    		entry.type = key;
				    		entry.slot = i;
				    		entry.value = (Integer)pr.getState()[m.get(key)+i];
				    		log.output(entry);
				    	}
					}
					nextMinute += MINUTE;
				}

				if (trueTime > nextShort){
					for (int i = 0; i < numPlayers; i++) {
					int handle = (Integer)pr.getState()[handleIdx+i];
                    Entity e = ec.getByHandle(handle);
                    if (e!=null){
                    	Entry entry = new Entry(time);
                    	entry.slot = i;
                    	entry.type="pos";
                    	Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
                    	entry.key = Arrays.toString(pos);
						log.output(entry);
                    }
					}
                    nextShort += POSITION_INTERVAL;
					}

				//todo figure out when wards get killed and by who, can detect entity disappearance, but how to figure out cause?
				//todo, rune spawns, maybe
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

				for (GameEvent g : match.getGameEvents()) {
					if (g.getEventId() == combatLogDescriptor.getEventId()) {
						CombatLogEntry cle = new CombatLogEntry(ctx, g);
						Entry entry = new Entry(time);
						switch(cle.getType()) {
						case 0:
							//damage
							entry.unit = cle.getAttackerNameCompiled();
							entry.key = cle.getTargetNameCompiled();
							entry.value = cle.getValue();
							entry.type = "damage";
							log.output(entry);
							if (cle.isTargetHero() && !cle.isTargetIllusion()){
								Entry entry2 = new Entry(time);
								entry2.unit = cle.getAttackerNameCompiled();
								entry2.key = cle.getInflictorName();
								entry2.type = "hero_hits";
								log.output(entry2);
							}
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
							String state =  GameRulesStateType.values()[cle.getValue() - 1].toString();
							entry.type = "state";
							entry.key = state;
							entry.value = Integer.valueOf(time);
							if (state.equals("PLAYING")){
								//set the gamezero to sample interval (gold,lh,xp) at appropriate moments
								gameZero = time;
							}
							log.output(entry);
							break;
						case 10:
							//xp gain
							entry.unit = cle.getTargetNameCompiled();
							entry.value = cle.getValue();
							entry.key = String.valueOf(cle.getXpReason());
							entry.type = "xp_reasons";
							log.output(entry);
							break;
						case 11:
							//purchase
							entry.unit = cle.getTargetNameCompiled();
							entry.key = cle.getValueName();
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
							log.output(entry);
							break;
						default:
							DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
							entry.type = type.name();
							System.err.format("%s (%s): %s\n", type.name(), type.ordinal(), g);
							log.output(entry);
							break;
    					}
						}
					}
			}
			
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
			finish(tStart, log, info);
			return;
	}
		public static void finish(long tStart, Log log, CDemoFileInfo info){
			Entry entry = new Entry();
			entry.type="epilogue";
			entry.key = new Gson().toJson(info.getGameInfo().getDota());
			log.output(entry);
			
			log.flush();
			long tMatch = System.currentTimeMillis() - tStart;
			System.err.format("%s sec\n", tMatch / 1000.0);
	}
}
