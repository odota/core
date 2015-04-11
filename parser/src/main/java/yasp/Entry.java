package yasp;

public class Entry {
    public Integer time;
    public String type;
    public String subtype;
    public Integer team;
    public String unit;
    public String key;
    public Integer value;
    public Integer slot;
    public String attacker;
    public String target;
    public String attacker_source;
    public String target_source;
    public String inflictor;
    public Integer gold_reason;
    public Integer xp_reason;
    public Boolean target_hero;
    public Boolean attacker_hero;
    public Boolean target_illusion;
    public Boolean attacker_illusion;
    public Integer gold;
    public Integer lh;
    public Integer xp;
    public Integer x;
    public Integer y;
    public Entry(){
    }
    public Entry(Integer time){
        this.time = time;
    }
}
