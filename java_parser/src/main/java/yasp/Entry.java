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
    //combat log fields
    public String attackername;
    public String targetname;
    public String sourcename;
    public String targetsourcename;
    public Boolean attackerhero;
    public Boolean targethero;
    public Boolean attackerillusion;
    public Boolean targetillusion;
    public String inflictor;
    public Integer gold_reason;
    public Integer xp_reason;
    public String valuename;
    //entity fields
    public Integer gold;
    public Integer lh;
    public Integer xp;
    public Integer x;
    public Integer y;
    public Float stuns;
    public Entry(){
    }
    public Entry(Integer time){
        this.time = time;
    }
}
