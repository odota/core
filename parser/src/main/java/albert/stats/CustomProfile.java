package albert.stats;

import com.dota2.proto.DotaUsermessages;
import com.dota2.proto.Usermessages;
import skadistats.clarity.parser.Profile;

public class CustomProfile extends Profile{
    public static Profile ALL_CHAT = new Profile()
        .dependsOn(USERMESSAGE_CONTAINER)
        .append(
        Usermessages.CUserMsg_SayText2.class);
}