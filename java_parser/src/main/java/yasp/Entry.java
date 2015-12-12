package yasp;

public class Entry {
    public Integer time;
    public String type;
    public Integer team;
    public String unit;
    public String key;
    public Integer value;
    public Integer slot;
    //chat event fields
    public Integer player1;
    public Integer player2;
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
    public Integer hero_id;
    //public Boolean hasPredictedVictory;

    public Entry() {
    }

    public Entry(Integer time) {
        this.time = time;
    }
}
