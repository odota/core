package yasp;

import skadistats.clarity.event.Event;
import skadistats.clarity.event.Provides;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.StringTable;
import skadistats.clarity.processor.gameevents.CombatLog;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.gameevents.OnGameEvent;
import skadistats.clarity.processor.gameevents.OnGameEventDescriptor;
import skadistats.clarity.processor.reader.OnTickEnd;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.stringtables.StringTables;
import skadistats.clarity.processor.stringtables.UsesStringTable;
import java.util.LinkedList;
import java.util.List;

@Provides({OnCombatLogEntry.class})
public class YASPCombatLog extends skadistats.clarity.processor.gameevents.CombatLog{

    public static final String STRING_TABLE_NAME = "CombatLogNames";
    public static final String GAME_EVENT_NAME   = "dota_combatlog";

    private final List<Entry> logEntries = new LinkedList<>();

    @OnGameEventDescriptor(GAME_EVENT_NAME)
    @UsesStringTable(CombatLog.STRING_TABLE_NAME)
    public void onGameEventDescriptor(Context ctx, GameEventDescriptor descriptor){
        typeIdx = descriptor.getIndexForKey("type");
        sourceNameIdx = descriptor.getIndexForKey("sourcename");
        targetNameIdx = descriptor.getIndexForKey("targetname");
        attackerNameIdx = descriptor.getIndexForKey("attackername");
        inflictorNameIdx = descriptor.getIndexForKey("inflictorname");
        attackerIllusionIdx = descriptor.getIndexForKey("attackerillusion");
        targetIllusionIdx = descriptor.getIndexForKey("targetillusion");
        valueIdx = descriptor.getIndexForKey("value");
        healthIdx = descriptor.getIndexForKey("health");
        timestampIdx = descriptor.getIndexForKey("timestamp");
        targetSourceNameIdx = descriptor.getIndexForKey("targetsourcename");

        timestampRawIdx = descriptor.getIndexForKey("timestampraw");
        attackerHeroIdx = descriptor.getIndexForKey("attackerhero");
        targetHeroIdx = descriptor.getIndexForKey("targethero");
        abilityToggleOnIdx = descriptor.getIndexForKey("ability_toggle_on");
        abilityToggleOffIdx = descriptor.getIndexForKey("ability_toggle_off");
        abilityLevelIdx = descriptor.getIndexForKey("ability_level");
        goldReasonIdx = descriptor.getIndexForKey("gold_reason");
        
        //yasp
        stunDurationIdx = descriptor.getIndexForKey("stun_duration");
        xpReasonIdx = descriptor.getIndexForKey("xp_reason");
        locationXIdx = descriptor.getIndexForKey("location_x");
        locationYIdx = descriptor.getIndexForKey("location_y");
        //System.err.println(Arrays.toString(descriptor.getKeys()));
    }

    @OnGameEvent(GAME_EVENT_NAME)
    public void onGameEvent(Context ctx, GameEvent gameEvent) {
        logEntries.add(new Entry(ctx, gameEvent));
    }

    @OnTickEnd
    public void onTickEnd(Context ctx) {
        Event<OnCombatLogEntry> ev = ctx.createEvent(OnCombatLogEntry.class, Entry.class);
        for (Entry e : logEntries) {
            ev.raise(e);
        }
        logEntries.clear();
    }

    private int typeIdx;
    private int sourceNameIdx;
    private int targetNameIdx;
    private int attackerNameIdx;
    private int inflictorNameIdx;
    private int attackerIllusionIdx;
    private int targetIllusionIdx;
    private int valueIdx;
    private int healthIdx;
    private int timestampIdx;
    private int targetSourceNameIdx;
    private Integer timestampRawIdx;
    private Integer attackerHeroIdx;
    private Integer targetHeroIdx;
    private Integer abilityToggleOnIdx;
    private Integer abilityToggleOffIdx;
    private Integer abilityLevelIdx;
    private Integer goldReasonIdx;
    
    //yasp
    Integer stunDurationIdx;
    Integer xpReasonIdx;
    Integer locationXIdx;
    Integer locationYIdx;

    public class Entry {

        private final StringTable combatLogNames;
        private final GameEvent event;

        private Entry(Context ctx, GameEvent event) {
            this.combatLogNames = ctx.getProcessor(StringTables.class).forName(STRING_TABLE_NAME);
            this.event = event;
        }

        private String readCombatLogName(int idx) {
            return idx == 0 ? null : combatLogNames.getNameByIndex(idx);
        }

        public GameEvent getGameEvent() {
            return event;
        }

        public int getType() {
            return event.getProperty(typeIdx);
        }

        public String getSourceName() {
            return translate(readCombatLogName((int)event.getProperty(sourceNameIdx)));
        }

        public String getTargetName() {
            return translate(readCombatLogName((int)event.getProperty(targetNameIdx)));
        }

        public String getAttackerName() {
            return translate(readCombatLogName((int)event.getProperty(attackerNameIdx)));
        }

        public String getInflictorName() {
            return translate(readCombatLogName((int)event.getProperty(inflictorNameIdx)));
        }

        public boolean isAttackerIllusion() {
            return event.getProperty(attackerIllusionIdx);
        }

        public boolean isTargetIllusion() {
            return event.getProperty(targetIllusionIdx);
        }

        public int getValue() {
            return event.getProperty(valueIdx);
        }

        public int getHealth() {
            return event.getProperty(healthIdx);
        }

        public float getTimestamp() {
            return event.getProperty(timestampIdx);
        }

        public String getTargetSourceName() {
            return translate(readCombatLogName((int)event.getProperty(targetSourceNameIdx)));
        }

        public float getTimestampRaw() {
            return event.getProperty(timestampRawIdx);
        }

        public boolean isAttackerHero() {
            return event.getProperty(attackerHeroIdx);
        }

        public boolean isTargetHero() {
            return event.getProperty(targetHeroIdx);
        }

        public boolean isAbilityToggleOn() {
            return event.getProperty(abilityToggleOnIdx);
        }

        public boolean isAbilityToggleOff() {
            return event.getProperty(abilityToggleOffIdx);
        }

        public int getAbilityLevel() {
            return event.getProperty(abilityLevelIdx);
        }
        
        //yasp
        private String translate(String in) {
            if (in!=null){
                if (in.startsWith("item_")){
                    in=in.substring("item_".length());
                }
            }
            return in;
        }
        public int getGoldReason() {
            if (goldReasonIdx==null){
                return 0;
            }
            return event.getProperty(goldReasonIdx);
        }
        public int getXpReason() {
            if (xpReasonIdx==null){
                return 0;
            }
            return event.getProperty(xpReasonIdx);
        }
        public int getStunDuration() {
            return event.getProperty(stunDurationIdx);
        }
        public int getLocationX() {
            return event.getProperty(locationXIdx);
        }
        public int getLocationY() {
            return event.getProperty(locationYIdx);
        }
        public String getValueName(){
            return translate(readCombatLogName(getValue()));
        }
        public String getTargetNameCompiled() {
            return (isTargetIllusion() ? "illusion_" : "") + getTargetName();
        }
        public String getAttackerNameCompiled() {
            return (isAttackerIllusion() ? "illusion_" : "") + getAttackerName();
        }
    }

}