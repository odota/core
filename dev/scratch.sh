#mongoexport --db dota --collection matches --query {match_id:1321352005} > output.json
 
#post a job to kue, didn't work with url for some reason
curl -H "Content-Type: application/json" -X POST -d \
 '{
"type":"parse",
"data":{
"title":"test",
"payload":{"match_id":1318234022,"fileName":"./.env_example"}
},
         "options" : {
         "priority": -15
       }
}' colab-sbx-244.oit.duke.edu:5000/kue/job --user user:pass