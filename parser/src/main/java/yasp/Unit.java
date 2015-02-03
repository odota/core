package yasp;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

public class Unit {
    public HashMap<String, Integer> itemuses = new HashMap<String, Integer>();
    public HashMap<String, Integer> itembuys = new HashMap<String, Integer>();
    public HashMap<String, Integer> runes = new HashMap<String, Integer>();
    public HashMap<String, Integer> damage = new HashMap<String, Integer>();
    public HashMap<String, Integer> healing = new HashMap<String, Integer>();
    public HashMap<String, Integer> gold_log = new HashMap<String, Integer>();
    public HashMap<String, Integer> xp_log = new HashMap<String, Integer>();
    public HashMap<String, Integer> kills = new HashMap<String, Integer>();
    public HashMap<String, Integer> abilityuses = new HashMap<String, Integer>();
    public HashMap<String, Integer> hero_hits = new HashMap<String, Integer>();
    public HashMap<String, Integer> modifier_applied = new HashMap<String, Integer>();
    public List<Entry> herokills = new ArrayList<Entry>();
    public List<Entry> timeline = new ArrayList<Entry>();
    
    private transient HashMap<String, HashMap<String, Integer>> counts = new HashMap<String, HashMap<String, Integer>>();
    
    public Unit(){
    counts.put("itemuses", itemuses);
    counts.put("itembuys",itembuys);
    counts.put("runes",runes);
    counts.put("damage",damage);
    counts.put("healing",healing);
    counts.put("gold_log",gold_log);
    counts.put("xp_log",xp_log);
    counts.put("kills",kills);
    counts.put("abilityuses",abilityuses);
    counts.put("hero_hits",hero_hits);
    counts.put("modifier_applied",modifier_applied);
    }

    public HashMap<String, Integer> getCount(String type){
        return counts.get(type);
    }
}
