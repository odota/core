package yasp;

import java.util.ArrayList;
import java.util.List;

public class Player {
    public String personaname;
    public long steamid;
    public List<Entry> buybacks = new ArrayList<Entry>();
    public List<Integer> lh = new ArrayList<Integer>();
    public List<Integer> gold = new ArrayList<Integer>();
    public List<Integer> xp = new ArrayList<Integer>();
    public float stuns;
    public Player(String personaname, long steamid){
        this.personaname = personaname;
        this.steamid = steamid;
    }
}
