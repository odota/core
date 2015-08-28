#!/bin/sh
cd `dirname "$0"`
pushd proto
rm *.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/base_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/c_peer2peer_netmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/connectionless_netmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/demo.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_broadcastmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_clientmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_commonmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_gcmessages_client.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_gcmessages_client_fantasy.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_gcmessages_common.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_gcmessages_server.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_modifiers.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/dota_usermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/econ_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/gameevents.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/gcsdk_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/gcsystemmsgs.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/netmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/network_connection.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/networkbasetypes.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/networksystem_protomessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/rendermessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steamdatagram_messages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steammessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steammessages_cloud.steamworkssdk.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steammessages_oauth.steamworkssdk.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/steammessages_unified_base.steamworkssdk.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/te.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/toolevents.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota_s2/usermessages.proto
popd

node generateTypes.js