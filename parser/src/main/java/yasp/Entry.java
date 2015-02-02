package yasp;

public class Entry {
    public String prefix;
    public String text;
    public int time;
    public transient String type;
    public transient String unit;
    public String key;
    public transient int value = 1;
    public Integer slot;
    public transient boolean herokills;
    public Entry(Integer time){
        this.time = time;
    }
    public void adjust(int gameZero){
        time -=gameZero;
    }
}
