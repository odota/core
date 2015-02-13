package yasp;

import java.util.ArrayList;
import java.util.List;
import java.util.Collections;

public class Player {
    public String personaname;
    public long steamid;
    public List<Entry> buybacks = new ArrayList<Entry>();
    public List<Integer> lh = new ArrayList<Integer>();
    public List<Integer> gold = new ArrayList<Integer>();
    public List<Integer> xp = new ArrayList<Integer>();
    public float stuns;
    public List<Integer[]> positions = new ArrayList<Integer[]>();
    public transient List<Integer> xBuf = new ArrayList<Integer>();
    public transient List<Integer> yBuf = new ArrayList<Integer>();
    public Player(String personaname, long steamid){
        this.personaname = personaname;
        this.steamid = steamid;
    }
    
    public Integer[] getMedian(){
        if (xBuf.size() <= 0) {
            Integer[] position = {0,0};
		    return position;
		}
        Collections.sort(xBuf);
		Collections.sort(yBuf);
		Integer[] position =  { xBuf.get(xBuf.size()/2), yBuf.get(yBuf.size()/2)};
		xBuf.clear();
		yBuf.clear();
		return position;
    }
}
