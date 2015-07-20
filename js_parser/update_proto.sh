#!/bin/sh
pushd proto
rm *.proto
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
popd