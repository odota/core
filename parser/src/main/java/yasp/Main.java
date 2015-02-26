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
import java.util.Map;
import java.util.HashMap;
import java.util.Collections;
import java.util.Set;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Arrays;
import com.google.gson.Gson;

public class Main {
	public static void main(String[] args) throws Exception{
		long tStart = System.currentTimeMillis();
		float MINUTE = 60;
		HashMap<Integer, Integer> slot_to_hero = new HashMap<Integer, Integer>();
		HashMap<Integer, Integer> hero_to_slot = new HashMap<Integer,Integer>();
		HashMap<String, Integer> name_to_slot = new HashMap<String, Integer>();
		HashMap<Integer, Integer> ehandle_to_slot = new HashMap<Integer, Integer>();
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
		int gameEnd = 0;
		int numPlayers = 10;
		List<Entry> log = new ArrayList<Entry>();
		Set<Integer> seenEntities = new HashSet<Integer>();
		Set<Integer> effectEntities = new HashSet<Integer>();

		if (args.length>0 && args[0].equals("-epilogue")){
			CDemoFileInfo info = Clarity.infoForStream(System.in);
			//todo function to generate epilogue entries
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
					if (!slot_to_hero.containsKey(i) || !slot_to_hero.get(i).equals(hero)){
						hero_to_slot.put(hero, i);
						slot_to_hero.put(i, hero);
						Entry entry = new Entry(time);
						entry.type="hero";
						entry.slot=i;
						entry.value=String.valueOf(hero);
						log.add(entry);
					}
				}
				
				if (trueTime > nextMinute) {
					Entry entry = new Entry(time);
					entry.type="time";
					entry.value = String.valueOf(trueTime);
					log.add(entry);
					
				    for (int i = 0; i < numPlayers; i++) {
				    	Entry entry2 = new Entry(time);
				    	entry2.type="interval";
					    entry2.slot = i;
					    HashMap<String, String> m = new HashMap<String,String>();
					    m.put("lh", String.valueOf(pr.getState()[lhIdx+i]));
					    m.put("xp",  String.valueOf(pr.getState()[xpIdx+i]));
					    m.put("gold", String.valueOf(pr.getState()[goldIdx+i]));
					    entry2.value = new Gson().toJson(m);
					    log.add(entry2);
					}
					nextMinute += MINUTE;
					}

				if (trueTime > nextShort){
					for (int i = 0; i < numPlayers; i++) {
					int handle = (Integer)pr.getState()[handleIdx+i];
					ehandle_to_slot.put(handle, i);
                    Entity e = ec.getByHandle(handle);
                    if (e!=null){
                    	Entry entry = new Entry(time);
                    	entry.slot = i;
                    	entry.type="pos";
                    	Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
                    	entry.value = Arrays.toString(pos);
						log.add(entry);
                    }
					}
                    nextShort += MINUTE/60;
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
                Iterator<Entity> obs = ec.getAllByDtName("DT_DOTA_NPC_Observer_Ward");
                while (obs.hasNext()){
                Entity e = obs.next();
                Integer handle = e.getHandle();
                if (!seenEntities.contains(handle)){
                	Entry entry = new Entry(time);
					Integer[] pos = {(Integer)e.getProperty("m_cellX"),(Integer)e.getProperty("m_cellY")};
					entry.type = "obs";
                    entry.value = Arrays.toString(pos);
                    entry.slot = ehandle_to_slot.get(e.getProperty("m_hOwnerEntity"));
                    entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
                    log.add(entry);
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
                    entry.value = Arrays.toString(pos);
                    entry.slot = ehandle_to_slot.get(e.getProperty("m_hOwnerEntity"));
                    entry.unit = String.valueOf(e.getProperty("m_iTeamNum"));
                    log.add(entry);
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
                        	entry.type=type;
                        	entry.slot=player1;
                        	entry.value=value;
                        	log.add(entry);
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
						entry.value =  String.valueOf(u.getProperty("text"));
						entry.type = "chat";
						log.add(entry);
					}
					else if (name.equals("CDOTAUserMsg_SpectatorPlayerClick")){
						//System.err.format("%s %s\n", time, u);
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
							entry.value = cle.getValueString();
							entry.type = "damage";
							log.add(entry);
							//break down damage instances on heroes by inflictor to get skillshot stats, only track hero hits
							if (cle.isTargetHero() && !cle.isTargetIllusion()){
								Entry entry2 = new Entry(time);
								entry2.unit = cle.getAttackerNameCompiled();
								entry2.key = cle.getInflictorName();
								entry2.type = "hero_hits";
								log.add(entry2);
							}
							break;
						case 1:
							//healing
							/*
                            unit = cle.getAttackerNameCompiled();
                            key = cle.getTargetNameCompiled();
                            val = cle.getValue();
                            entry.put("unit", unit);
                            entry.put("time", time);
                            entry.put("key", key);
                            entry.put("value", val);
                            entry.put("type", "healing");
                            log.put(entry);
							 */
							break;
						case 2:
							//gain buff/debuff
							/*
                            unit = cle.getAttackerNameCompiled(); //source of buff
                            key = cle.getInflictorName(); //the buff
                            String unit2 = cle.getTargetNameCompiled(); //target of buff
                            entry.put("unit", unit);
                            entry.put("unit2", unit2);
                            entry.put("time", time);
                            entry.put("key", key);
                            entry.put("type", "modifier_applied");
                            log.put(entry);
							 */
							break;
						case 3:
							//lose buff/debuff
							// log.info("{} {} loses {} buff/debuff", time, cle.getTargetNameCompiledCompiled(), cle.getInflictorName() );
							break;
						case 4:
							//kill
							entry.unit = cle.getAttackerNameCompiled();
							entry.key = cle.getTargetNameCompiled();
							entry.type = "kills";
							log.add(entry);
							if ((cle.isAttackerHero() && cle.isTargetHero() && !cle.isTargetIllusion())){
								Entry entry2 = new Entry(time);
								entry.unit = cle.getAttackerNameCompiled();
								entry.key = cle.getTargetNameCompiled();
								entry.type="herokills";
								log.add(entry);
							}
							break;
						case 5:
							//ability use
							entry.unit = cle.getAttackerNameCompiled();
							entry.key = cle.getInflictorName();
							entry.type = "abilityuses";
							log.add(entry);
							break;
						case 6:
							//item use
							entry.unit = cle.getAttackerNameCompiled();
							entry.key = cle.getInflictorName();
							entry.type = "itemuses";
							log.add(entry);
							break;
						case 8:
							//gold gain/loss
							entry.key = String.valueOf(cle.getGoldReason());
							entry.unit = cle.getTargetNameCompiled();
							entry.value = cle.getValueString();
							entry.type = "gold_log";
							log.add(entry);
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
							entry.unit = cle.getTargetNameCompiled();
							entry.value = cle.getValueString();
							entry.key = String.valueOf(cle.getXpReason());
							entry.type = "xp_log";
							log.add(entry);
							break;
						case 11:
							//purchase
							entry.unit = cle.getTargetNameCompiled();
							entry.key = cle.getValueName();
							entry.type = "itembuys";
							log.add(entry);
							break;
						case 12:
							//buyback
							entry.slot = cle.getValue();
							entry.key = "buyback";
							entry.type = "buybacks";
							log.add(entry);
							break;
						case 13:
							//ability trigger
							//System.err.format("%s %s proc %s %s%n", time, cle.getAttackerNameCompiled(), cle.getInflictorName(), cle.getTargetNameCompiled() != null ? "on " + cle.getTargetNameCompiled() : "");
							break;
						default:
							DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
							System.err.format("%s (%s): %s%n", type.name(), type.ordinal(), g);
							break;
						}
					}
				}
			}
			
			for (int i = 0; i < numPlayers; i++) {
				String stuns = String.valueOf(pr.getState()[stunIdx+i]);
				Entry entry = new Entry(time);
				entry.slot=i;
				entry.type="stun";
				entry.value=stuns;
				log.add(entry);
			}

			//load epilogue
			CDemoFileInfo info = match.getFileInfo();
			//System.err.println(info);
			List<CPlayerInfo> players = info.getGameInfo().getDota().getPlayerInfoList();
			for (int i = 0;i<players.size();i++) {
				String replayName = players.get(i).getPlayerName();
				name_to_slot.put(replayName, i);
			}
			int match_id = info.getGameInfo().getDota().getMatchId();
			
			Gson g = new Gson();
			Entry entry = new Entry(0);
			entry.type="metadata";
			HashMap<String, String> m = new HashMap<String, String>();
			m.put("version","5");
			m.put("match_id", String.valueOf(match_id));
			m.put("hero_to_slot", g.toJson(hero_to_slot));
			m.put("name_to_slot", g.toJson(name_to_slot));
			entry.value = g.toJson(m);
			log.add(0, entry);
			
			for (int i=0;i<log.size();i++){
				Entry l = log.get(i);
				l.time-=gameZero;
			}
			System.out.println(g.toJson(log));

			finish(tStart);
			return;
	}
		public static void finish(long tStart){
			long tMatch = System.currentTimeMillis() - tStart;
			System.err.format("%s sec\n", tMatch / 1000.0);
	}
}
