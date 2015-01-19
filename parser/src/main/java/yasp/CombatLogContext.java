package yasp;

import skadistats.clarity.model.GameEventDescriptor;
import skadistats.clarity.model.StringTable;

public class CombatLogContext {

    StringTable combatLogNames;

    int typeIdx;
    int sourceNameIdx;
    int targetNameIdx;
    int attackerNameIdx;
    int inflictorNameIdx;
    int attackerIllusionIdx;
    int targetIllusionIdx;
    int valueIdx;
    int healthIdx;
    int timestampIdx;
    int targetSourceNameIdx;
    Integer timestampRawIdx;
    Integer attackerHeroIdx;
    Integer targetHeroIdx;
    Integer abilityToggleOnIdx;
    Integer abilityToggleOffIdx;
    Integer abilityLevelIdx;
    Integer goldReasonIdx;
    Integer stunDurationIdx;
    Integer xpReasonIdx;
    
    public CombatLogContext(StringTable combatLogNamesTable, GameEventDescriptor descriptor) {
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

}