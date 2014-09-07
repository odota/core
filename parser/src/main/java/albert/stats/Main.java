package albert.stats;
import java.util.*;
import skadistats.clarity.model.Entity;
import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;

public class Main {
    public static final float MINUTES = 60;
    public static final String[] PLAYER_IDS = {"0000","0001","0002","0003","0004","0005","0006","0007","0008","0009"};

    public static void main(String[] args) throws Exception {
        long tStart = System.currentTimeMillis();

        String[] playerNames = new String[10];
        Long[] steamIds = new Long[10];
        ArrayList[] playerCreepScores = new ArrayList[10];
        ArrayList[] playerDenies = new ArrayList[10];
        ArrayList[] playerEXP = new ArrayList[10];
        ArrayList[] playerGold = new ArrayList[10];
        ArrayList[] playerLevel = new ArrayList[10];
        ArrayList timeList = new ArrayList();

        for (int i = 0; i < PLAYER_IDS.length; i++) {
            playerCreepScores[i] = new ArrayList();
            playerDenies[i] = new ArrayList();
            playerEXP[i] = new ArrayList();
            playerGold[i] = new ArrayList();
            playerLevel[i] = new ArrayList();            
        }

        Match match = new Match();
        float sec = MINUTES;
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.ENTITIES, Profile.CHAT_MESSAGES);

        while(iter.hasNext()) {
            iter.next().apply(match);

            float time = match.getGameTime();

            if (time > sec) {
                timeList.add((int) time);

                Entity pr = match.getPlayerResource();

                //Get player names
                if (playerNames[0] == null) {
                    for (int i = 0; i < PLAYER_IDS.length; i++) {
                        playerNames[i] = pr.getProperty("m_iszPlayerNames" + "." + PLAYER_IDS[i]);
                        steamIds[i] = pr.getProperty("m_iPlayerSteamIDs" + "." + PLAYER_IDS[i]);
                    }
                }

                for (int i = 0; i < PLAYER_IDS.length; i++) {
                    playerCreepScores[i].add(pr.getProperty("m_iLastHitCount" + "." + PLAYER_IDS[i]));
                    playerDenies[i].add(pr.getProperty("m_iDenyCount" + "." + PLAYER_IDS[i]));
                    playerEXP[i].add(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedXP" + "." + PLAYER_IDS[i]));
                    playerGold[i].add(pr.getProperty("EndScoreAndSpectatorStats.m_iTotalEarnedGold" + "." + PLAYER_IDS[i]));
                    playerLevel[i].add(pr.getProperty("m_iLevel" + "." + PLAYER_IDS[i]));                    
                }

                sec += MINUTES;
            }
        }

        Map doc = new HashMap();
        doc.put("playerNames", playerNames);
        doc.put("steamIds", steamIds);
        doc.put("time", timeList);
        doc.put("lastHits", playerCreepScores);
        doc.put("denies", playerDenies);
        doc.put("xp", playerEXP);
        doc.put("gold", playerGold);
        doc.put("levels", playerLevel);

        System.out.println(doc);
        //output debug to stderr
        long tMatch = System.currentTimeMillis() - tStart;
        System.err.println("parse time: "+(tMatch) / 1000.0);

    }

}
/*
 * package skadistats.clarity.examples.combatlog;

import org.joda.time.Duration;
import org.joda.time.format.PeriodFormatter;
import org.joda.time.format.PeriodFormatterBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import skadistats.clarity.Clarity;
import skadistats.clarity.match.Match;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.GameRulesStateType;
import skadistats.clarity.parser.Profile;
import skadistats.clarity.parser.TickIterator;

import com.dota2.proto.DotaUsermessages.DOTA_COMBATLOG_TYPES;

public class Main {
    
    private static final PeriodFormatter GAMETIME_FORMATTER = new PeriodFormatterBuilder()
        .minimumPrintedDigits(2)
        .printZeroAlways()
        .appendMinutes()
        .appendLiteral(":")
        .appendSeconds()
        .appendLiteral(".")
        .appendMillis3Digit()
        .toFormatter();
    
    public static void main(String[] args) throws Exception {

        long tStart = System.currentTimeMillis();

        Logger log = LoggerFactory.getLogger("combatlog");

        boolean initialized = false;
        GameEventDescriptor combatLogDescriptor = null;
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.COMBAT_LOG);
        
        while(iter.hasNext()) {
            iter.next().apply(match);

            if (!initialized) {
                combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog"); 
                CombatLogEntry.init(
                    match.getStringTables().forName("CombatLogNames"), 
                    combatLogDescriptor
                );
                initialized = true;
            }
            
            for (GameEvent g : match.getGameEvents()) {
                if (g.getEventId() != combatLogDescriptor.getEventId()) {
                    continue;
                }
                CombatLogEntry cle = new CombatLogEntry(g);
                String time = "[" + GAMETIME_FORMATTER.print(Duration.millis((int)(1000.0f * cle.getTimestamp())).toPeriod()) +  "]";
                switch(cle.getType()) {
                    case 0:
                        log.info("{} {} hits {}{} for {} damage{}", 
                            time, 
                            cle.getAttackerNameCompiled(),
                            cle.getTargetNameCompiled(), 
                            cle.getInflictorName() != null ? String.format(" with %s", cle.getInflictorName()) : "",
                            cle.getValue(),
                            cle.getHealth() != 0 ? String.format(" (%s->%s)", cle.getHealth() + cle.getValue(), cle.getHealth()) : ""
                        );
                        break;
                    case 1:
                        log.info("{} {}'s {} heals {} for {} health ({}->{})", 
                            time, 
                            cle.getAttackerNameCompiled(), 
                            cle.getInflictorName(), 
                            cle.getTargetNameCompiled(), 
                            cle.getValue(), 
                            cle.getHealth() - cle.getValue(), 
                            cle.getHealth()
                        );
                        break;
                    case 2:
                        log.info("{} {} receives {} buff/debuff from {}", 
                            time, 
                            cle.getTargetNameCompiled(), 
                            cle.getInflictorName(), 
                            cle.getAttackerNameCompiled()
                        );
                        break;
                    case 3:
                        log.info("{} {} loses {} buff/debuff", 
                            time, 
                            cle.getTargetNameCompiled(), 
                            cle.getInflictorName()
                        );
                        break;
                    case 4:
                        log.info("{} {} is killed by {}", 
                            time, 
                            cle.getTargetNameCompiled(), 
                            cle.getAttackerNameCompiled()
                        );
                        break;
                    case 5:
                        log.info("{} {} {} ability {} (lvl {}){}{}", 
                            time, 
                            cle.getAttackerNameCompiled(),
                            cle.isAbilityToggleOn() || cle.isAbilityToggleOff() ? "toggles" : "casts",
                            cle.getInflictorName(),
                            cle.getAbilityLevel(),
                            cle.isAbilityToggleOn() ? " on" : cle.isAbilityToggleOff() ? " off" : "",
                            cle.getTargetName() != null ? " on " + cle.getTargetNameCompiled() : ""
                        );
                        break;
                    case 6:
                        log.info("{} {} uses {}", 
                            time, 
                            cle.getAttackerNameCompiled(),
                            cle.getInflictorName()
                        );
                        break;
                    case 8:
                        log.info("{} {} {} {} gold", 
                            time, 
                            cle.getTargetNameCompiled(),
                            cle.getValue() < 0 ? "looses" : "receives",
                            Math.abs(cle.getValue())
                        );
                        break;
                    case 9:
                        log.info("{} game state is now {}", 
                            time,
                            GameRulesStateType.values()[cle.getValue() - 1]
                        );
                        break;
                    case 10:
                        log.info("{} {} gains {} XP", 
                            time, 
                            cle.getTargetNameCompiled(),
                            cle.getValue()
                        );
                        break;
                    case 11:
                        log.info("{} {} buys item {}", 
                            time, 
                            cle.getTargetNameCompiled(),
                            cle.getValue()
                        );
                        break;
                    case 12:
                        log.info("{} player in slot {} has bought back", 
                            time, 
                            cle.getValue()
                        );
                        break;
                        
                    default:
                        DOTA_COMBATLOG_TYPES type = DOTA_COMBATLOG_TYPES.valueOf(cle.getType());
                        log.info("\n{} ({}): {}\n", type.name(), type.ordinal(), g);
                        break;
                }
            }
        }

        long tMatch = System.currentTimeMillis() - tStart;
        log.info("total time taken: {}s", (tMatch) / 1000.0);
        
    }

}
*/