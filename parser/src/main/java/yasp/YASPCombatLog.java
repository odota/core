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
import java.util.Arrays;

@Provides({OnYASPCombatLogEntry.class})
public class YASPCombatLog{

    public static final String STRING_TABLE_NAME = "CombatLogNames";
    public static final String GAME_EVENT_NAME   = "dota_combatlog";

    private final List<Entry> logEntries = new LinkedList<>();

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
    Integer xpReasonIdx;
    //temporary manually set idx values for fields missing in gameeventdescriptor
    Integer stunDurationIdx = 16;
    Integer slowDurationIdx = 17;
    Integer locationXIdx = 21;
    Integer locationYIdx = 22;
    Integer modifierDurationIdx = 25;
    Integer lastHitsIdx = 27;
    Integer attackerTeamIdx = 28;
    Integer targetTeamIdx = 29;
    Integer obsWardsPlacedIdx = 30;
    Integer assist_player0Idx = 31;
	Integer assist_player1Idx = 32;
	Integer assist_player2Idx = 33;
	Integer assist_player3Idx = 34;
	Integer stack_countIdx = 35;
	Integer hidden_modifierIdx = 36;
	
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
        xpReasonIdx = descriptor.getIndexForKey("xp_reason");
        //TODO: descriptor only contains a subset of the keys available
        //we can't use this method to get indices of some combat log fields, so trying to set them manually
        //however this doesn't work due to array out of bounds error, the gameeventdescriptor must be set properly?
        /*
        stunDurationIdx = descriptor.getIndexForKey("stun_duration");
        slowDurationIdx = descriptor.getIndexForKey("slow_duration");
        locationXIdx = descriptor.getIndexForKey("location_x");
        locationYIdx = descriptor.getIndexForKey("location_y");
    */
        System.err.println(Arrays.toString(descriptor.getKeys()));
    }

    @OnGameEvent(GAME_EVENT_NAME)
    public void onGameEvent(Context ctx, GameEvent gameEvent) {
        logEntries.add(new Entry(ctx, gameEvent));
    }

    @OnTickEnd
    public void onTickEnd(Context ctx, boolean synthetic) {
        Event<OnYASPCombatLogEntry> ev = ctx.createEvent(OnYASPCombatLogEntry.class, Entry.class);
        for (Entry e : logEntries) {
            ev.raise(e);
        }
        logEntries.clear();
    }
    
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

        public boolean isAbilityToggleOn() {
            return event.getProperty(abilityToggleOnIdx);
        }

        public boolean isAbilityToggleOff() {
            return event.getProperty(abilityToggleOffIdx);
        }

        public int getAbilityLevel() {
            return event.getProperty(abilityLevelIdx);
        }
        
        //yasp augmentations
        //TODO: for full safety, all getters should check for null on Idx
        public String toString(){
            //print the underlying gameevent
            //this uses gameeventdescriptor to dump!  missing fields aren't shown
            return event.toString();
        }
        public boolean isTargetHero() {
            if (targetHeroIdx==null) {
                return true;
            }
            return event.getProperty(targetHeroIdx);
        }
        public boolean isAttackerHero() {
            if (attackerHeroIdx==null){
                return true;
            }
            return event.getProperty(attackerHeroIdx);
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
        public String getValueName(){
            return translate(readCombatLogName(getValue()));
        }
        public float getStunDuration() {
            return event.getProperty(stunDurationIdx);
        }
        public float getSlowDuration() {
            return event.getProperty(slowDurationIdx);
        }
        public int getLocationX() {
            return event.getProperty(locationXIdx);
        }
        public int getLocationY() {
            return event.getProperty(locationYIdx);
        }
        public float getModifierDuration(){
            return event.getProperty(modifierDurationIdx);
        }
        public int getLastHits(){
            return event.getProperty(lastHitsIdx);
        }
        public int getAttackerTeam(){
            return event.getProperty(attackerTeamIdx);
        }
        public int getTargetTeam(){
            return event.getProperty(targetTeamIdx);
        }
        public int getObsWardsPlaced(){
            return event.getProperty(obsWardsPlacedIdx);
        }
        //string formatting functions, should be client defined
        private String translate(String in) {
            if (in!=null){
                if (in.startsWith("item_")){
                    in=in.substring("item_".length());
                }
            }
            return in;
        }
        public String getTargetNameCompiled() {
            return (isTargetIllusion() ? "illusion_" : "") + getTargetName();
        }
        public String getAttackerNameCompiled() {
            return (isAttackerIllusion() ? "illusion_" : "") + getAttackerName();
        }
    }

}