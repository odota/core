package yasp;
import com.google.gson.Gson;
import java.util.List;
import java.util.ArrayList;

public class Log{
    private Gson g;
    private List<Entry> log;
    public Log(){
        g = new Gson();
        //buffers the log in Java before emitting
        //log = new ArrayList<Entry>();
        log = null;
    }
    public void output(Entry e){
        if (log!=null){
            log.add(e);
        }
        else{
            System.out.println(g.toJson(e));
        }
    }
    public void flush(){
        if (log!=null){
            System.out.println(g.toJson(log));
        }
    }
}