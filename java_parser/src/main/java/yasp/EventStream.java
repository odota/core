package yasp;
import com.google.gson.Gson;
import java.util.List;

public class EventStream{
    private Gson g;
    private List<Entry> es;
    public EventStream(){
        g = new Gson();
    }
    public void output(Entry e){
        System.out.print(g.toJson(e)+"\n");
    }
}