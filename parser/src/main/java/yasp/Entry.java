package yasp;
import com.google.gson.Gson;

public class Entry {
    public Integer time;
    public String type;
    public String unit;
    public String key;
    public String value;
    public Integer slot;
    public Entry(Integer time){
        this.time = time;
    }
}
