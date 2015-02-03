package yasp;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import com.google.gson.Gson;

public class Output {
    //increment version when adding breaking changes
    public int version = 3;
    public int match_id;
    public int game_zero;
    public int game_end;
    public HashMap<String, Integer> hero_to_slot = new HashMap<String,Integer>();
    public List<Player> players = new ArrayList<Player>();
    public List<Integer> times = new ArrayList<Integer>();
    public HashMap<String, Unit> heroes = new HashMap<String, Unit>();
    public List<Entry> chat = new ArrayList<Entry>();
    
    public void addUnit(String unit){
        heroes.put(unit, new Unit());
    }
    
    public void addPlayer(String personaname, long steamid){
        players.add(new Player(personaname, steamid));
    }
    
    public String toString(){
        Gson gson = new Gson();
        String json = gson.toJson(this);
        return json;
    }
}