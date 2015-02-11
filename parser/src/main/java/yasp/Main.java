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

public class Main {
	public static void finish(long tStart, Output doc){
			long tMatch = System.currentTimeMillis() - tStart;
			System.out.println(doc);
			System.err.format("%s sec\n", tMatch / 1000.0);
			System.exit(0);	
	}

	public static void main(String[] args) throws Exception{
		long tStart = System.currentTimeMillis();
		float MINUTE = 60;
		String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};
		HashMap<String, Integer> name_to_slot = new HashMap<String, Integer>();
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
		Match match = new Match();
		float nextMinute = 0;
		int gameZero = Integer.MIN_VALUE;
		int gameEnd = 0;
		int numPlayers = 10;
		Output doc = new Output();
		List<Entry> log = new ArrayList<Entry>();

		if (args.length>0 && args[0].equals("-epilogue")){
			CDemoFileInfo info = Clarity.infoForStream(System.in);
			doc.match_id = info.getGameInfo().getDota().getMatchId();
			finish(tStart, doc);
		}
		else{
			TickIterator iter = Clarity.tickIteratorForStream(System.in, CustomProfile.ALL);
			while(iter.hasNext()) {
				iter.next().apply(match);
				int time = (int) match.getGameTime();
				int trueTime=time-gameZero;
				Entity pr = match.getPlayerResource();
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
					for (int i = 0; i < numPlayers; i++) {
						String name = pr.getState()[nameIdx+i].toString();
						Long steamid = (Long) pr.getState()[steamIdx+i];
						doc.addPlayer(name, steamid);
					}
					initialized = true;
				}

				if (trueTime > nextMinute) {
					doc.times.add(trueTime);
					for (int i = 0; i < numPlayers; i++) {
						Player player = doc.players.get(i);
						player.lh.add((Integer)pr.getState()[lhIdx+i]);
						player.xp.add((Integer)pr.getState()[xpIdx+i]);
						player.gold.add((Integer)pr.getState()[goldIdx+i]);
					}
					nextMinute += MINUTE;
				}
				
				for (int i = 0; i < numPlayers; i++) {
					String hero = pr.getState()[heroIdx+i].toString();
					doc.hero_to_slot.put(hero, i);
					Float stuns = (Float)pr.getState()[stunIdx+i];
					doc.players.get(i).stuns = stuns;
					//todo sample each hero's x/y position every tick
					//every interval (5 minutes?), find the median x and median y, and save this value
					int handle = (Integer)pr.getState()[handleIdx+i];
                    Entity e = ec.getByHandle(handle);
                    if (e!=null && i == 0){
                    	//System.err.format("time: %s, hero: %s, x: %s, y: %s,\n", trueTime, i, e.getProperty("m_cellX"), e.getProperty("m_cellY"));
                    }
				}
				
				/*
                Iterator<Entity> runes = ec.getAllByDtName("DT_DOTA_Item_Rune");
                while (runes.hasNext()){
                Entity e = runes.next();
                //System.err.format("rune: %s %s %s,%s %n", trueTime, e.getProperty("m_iRuneType"), e.getProperty("m_cellX"), e.getProperty("m_cellY"));
                }
				*/
				for (UserMessage u : match.getUserMessages()) {
					String name = u.getName();
					if (name.equals("CDOTAUserMsg_ChatEvent")){
						/*
                        String player1=u.getProperty("playerid_1").toString();
                        String player2=u.getProperty("playerid_2").toString();
                        String type = u.getProperty("type").toString();
                        String value = u.getProperty("value").toString();
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
                        else{
                        System.err.format("%s %s%n", time, u);
                        }
						 */
					}
					else if (name.equals("CUserMsg_SayText2")){
						String prefix = u.getProperty("prefix").toString();
						Entry entry = new Entry(time);
						entry.prefix = prefix;
						entry.text =  u.getProperty("text");
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
							entry.value = cle.getValue();
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
							//System.err.format("kill, x:%s, y%s\n", cle.getLocationX(), cle.getLocationY());
							if (cle.isAttackerHero() && cle.isTargetHero() && !cle.isTargetIllusion()){
								entry.herokills = true;
							}
							log.add(entry);
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
							entry.value = cle.getValue();
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
							entry.value = cle.getValue();
							entry.key = String.valueOf(cle.getXpReason());
							entry.type = "xp_log";
							log.add(entry);
							break;
						case 11:
							//purchase
							if (!cle.getValueName().contains("recipe")){
								entry.unit = cle.getTargetNameCompiled();
								entry.key = cle.getValueName();
								entry.type = "itembuys";
								log.add(entry);
							}
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
			iter.close();

			//load epilogue
			CDemoFileInfo info = match.getFileInfo();
			System.err.println(info);
			List<CPlayerInfo> players = info.getGameInfo().getDota().getPlayerInfoList();
			for (int i = 0;i<players.size();i++) {
				String replayName = players.get(i).getPlayerName();
				name_to_slot.put(replayName, i);
			}
			int match_id = info.getGameInfo().getDota().getMatchId();
			doc.match_id = match_id;
			doc.game_zero = gameZero;
			doc.game_end = gameEnd;

			//process events in log
			for (int i =0;i<log.size();i++){
				Entry entry = log.get(i);
				entry.adjust(gameZero);
				String type = entry.type;
				if (type.equals("buybacks")){
					Integer slot = entry.slot;
					doc.players.get(slot).buybacks.add(entry);
					continue;
				}
				if (type.equals("chat")){
					String prefix = entry.prefix;
					if(name_to_slot.containsKey(prefix)){
						Integer slot = name_to_slot.get(prefix);
						entry.slot = slot;
						doc.chat.add(entry);
					}
					else{
						System.err.format("[CHAT]: %s not found in names\n", prefix);
					}
					continue;
				}
				HashMap<String, Unit> heroes = doc.heroes;
				String unit = entry.unit;
				if (!heroes.containsKey(unit)){
					doc.addUnit(unit);
				}
				Unit hero = heroes.get(unit);
				HashMap<String, Integer> counts = hero.getCount(type);
				String key = entry.key;
				Integer count = counts.containsKey(key) ? counts.get(key) : 0;
				counts.put(key, count+entry.value);
				//put the item into this hero's purchases
				if (type.equals("itembuys")){
					hero.timeline.add(entry);
				}
				//put the kill into this hero's hero kills
				if (entry.herokills){
					hero.herokills.add(entry);
				}
			}
			finish(tStart, doc);
		}
	}
}
