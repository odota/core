package yasp;
import com.google.gson.Gson;
import java.util.List;

public class EventStream{
    private Gson g;
    private List<Entry> es;
    public EventStream(){
        g = new Gson();
        //if es is defined, buffers the log in Java before emitting
        //es = new ArrayList<Entry>();
        es = null;
    }
    public void output(Entry e){
        if (es!=null){
            es.add(e);
        }
        else{
            System.out.println(g.toJson(e));
        }
    }
    public void flush(){
        if (es!=null){
            System.out.println(g.toJson(es));
        }
    }
}