package yasp;

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

public class Main2 {
    
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
        CombatLogContext ctx = null;
        Match match = new Match();
        TickIterator iter = Clarity.tickIteratorForFile(args[0], Profile.COMBAT_LOG);
        
        while(iter.hasNext()) {
            iter.next().apply(match);

            if (!initialized) {
                combatLogDescriptor = match.getGameEventDescriptors().forName("dota_combatlog");
                ctx = new CombatLogContext(
	                match.getStringTables().forName("CombatLogNames"), 
	                combatLogDescriptor
                );
                initialized = true;
            }
            
            for (GameEvent g : match.getGameEvents()) {
                if (g.getEventId() != combatLogDescriptor.getEventId()) {
                    continue;
                }
                CombatLogEntry cle = new CombatLogEntry(ctx, g);
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