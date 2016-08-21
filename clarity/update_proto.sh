#!/bin/sh
# Source 1 protobufs
pushd src/main/proto/s1
rm *.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/ai_activity.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/demo.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_commonmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_modifiers.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_usermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/netmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/networkbasetypes.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/usermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/network_connection.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_common.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/steammessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/gcsdk_gcmessages.proto

sed -i '1i option java_package = "skadistats.clarity.wire.s1.proto";' *.proto
protoc --java_out=../java *.proto
popd

# Source 2 protobufs
pushd src/main/proto/s2
rm *.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/ai_activity.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/demo.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_commonmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_modifiers.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_usermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/netmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/networkbasetypes.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/usermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/network_connection.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_gcmessages_common.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steammessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/gcsdk_gcmessages.proto

sed -i '1i option java_package = "skadistats.clarity.wire.s2.proto";' *.proto
protoc --java_out=../java *.proto
popd