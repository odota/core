package yasp;
import skadistats.clarity.processor.gameevents.CombatLog.Entry;
import skadistats.clarity.model.GameEvent;

public class CombatLogEntry extends Entry{
    
private final CombatLogContext ctx;
private final GameEvent event;

    public CombatLogEntry(CombatLogContext ctx, GameEvent event) {
    	//this.ctx = new CombatLogContext();
    	this.ctx=ctx;
        this.event = event;
    }

    //new functions
    private String translate(String in) {
        if (in!=null){
            if (in.startsWith("item_")){
                in=in.substring("item_".length());
            }
        }
        return in;
    }
    public int getGoldReason() {
        if (ctx.goldReasonIdx==null){
            return 0;
        }
        return event.getProperty(ctx.goldReasonIdx);
    }
    public int getXpReason() {
        if (ctx.xpReasonIdx==null){
            return 0;
        }
        return event.getProperty(ctx.xpReasonIdx);
    }
    public int getStunDuration() {
        return event.getProperty(ctx.stunDurationIdx);
    }
    public int getLocationX() {
        return event.getProperty(ctx.locationXIdx);
    }
    public int getLocationY() {
        return event.getProperty(ctx.locationYIdx);
    }
    public String getValueString(){
        return String.valueOf(getValue());
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
