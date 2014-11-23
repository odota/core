package albert.stats;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.StringTable;
import java.util.Arrays;

public class CombatLogEntry {

    private static StringTable combatLogNames;

    private static int typeIdx;
    private static int sourceNameIdx;
    private static int targetNameIdx;
    private static int attackerNameIdx;
    private static int inflictorNameIdx;
    private static int attackerIllusionIdx;
    private static int targetIllusionIdx;
    private static int valueIdx;
    private static int healthIdx;
    private static int timestampIdx;
    private static int targetSourceNameIdx;
    private static Integer timestampRawIdx;
    private static Integer attackerHeroIdx;
    private static Integer targetHeroIdx;
    private static Integer abilityToggleOnIdx;
    private static Integer abilityToggleOffIdx;
    private static Integer abilityLevelIdx;
    private static Integer goldReasonIdx;
    private static Integer stunDurationIdx;
    private static Integer xpReasonIdx;

    public static void init(StringTable combatLogNamesTable, GameEventDescriptor descriptor) {
        combatLogNames = combatLogNamesTable;
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
        stunDurationIdx = descriptor.getIndexForKey("stun_duration");
        xpReasonIdx = descriptor.getIndexForKey("xp_reason");
        //System.err.println(Arrays.toString(descriptor.getKeys()));
    }

    private final GameEvent event;

    public CombatLogEntry(GameEvent event) {
        this.event = event;
    }

    private String readCombatLogName(int idx) {
        return idx == 0 ? null : combatLogNames.getNameByIndex(idx);
    }

    private String translate(String in) {
        if (in!=null){
            if (in.startsWith("item_")){
                in=in.substring("item_".length());
            }
        }
        return in;
    }

    public int getType() {
        return event.getProperty(typeIdx);
    }

    public String getSourceName() {
        return translate(readCombatLogName((int)event.getProperty(sourceNameIdx)));
    }

    public String getTargetName() {
        return (isTargetIllusion() ? "illusion_" : "") + translate(readCombatLogName(getTargetIndex()));
    }
    public int getTargetIndex(){
        return (int)event.getProperty(targetNameIdx);
    }

    public String getAttackerName() {
        return (isAttackerIllusion() ? "illusion_" : "") + translate(readCombatLogName(getAttackerIndex()));
    }

    public int getAttackerIndex(){
        return (int)event.getProperty(attackerNameIdx);
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

    public String getValueName(){
        return translate(readCombatLogName(getValue()));
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

    public int getGoldReason() {
        if (goldReasonIdx!=null){
            return event.getProperty(goldReasonIdx);
        }
        return 0;
    }

    public int getXpReason() {
        if (xpReasonIdx!=null){
            return event.getProperty(xpReasonIdx);
        }
        return 0;
    }

    public int getStunDuration() {
        return event.getProperty(stunDurationIdx);
    }


}