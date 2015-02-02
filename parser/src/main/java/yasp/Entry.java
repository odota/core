package yasp;

public class Entry {
    public String prefix;
    public String text;
    public int time;
    public String type;
    public String unit;
    public String key;
    public int value = 1;
    public int slot;
    public boolean herokills;
    public Entry(Integer time){
        this.time = time;
    }
    public void adjust(int gameZero){
        time -=gameZero;
    }
}
