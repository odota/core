#!/bin/bash
pushd proto
rm *.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/base_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/gcsdk_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_shared_enums.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/econ_shared_enums.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_fantasy.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_common.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_common_match_management.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_match_metadata.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/steammessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/econ_gcmessages.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/gcsystemmsgs.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_msgid.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_chat.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_match_management.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_client_enums.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_guild.proto
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_watch.proto 
wget https://raw.githubusercontent.com/SteamDatabase/GameTracking/master/Protobufs/dota/dota_gcmessages_client_team.proto
popd