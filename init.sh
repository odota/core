#STANDALONE
sudo add-apt-repository ppa:openjdk-r/ppa
echo "deb http://debian.datastax.com/community stable main" | sudo tee -a /etc/apt/sources.list.d/cassandra.sources.list
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ trusty-pgdg main" >> /etc/apt/sources.list.d/postgresql.list'
curl -L http://debian.datastax.com/debian/repo_key | sudo apt-key add -
sudo apt-get update && sudo apt-get upgrade
sudo apt-get -y install make g++ build-essential redis-server postgresql-9.5 openjdk-8-jdk nodejs-legacy npm curl git maven cassandra
sudo npm install -g n && sudo n latest
sudo npm install -g npm
sudo npm run create
sudo update-alternatives --install "/usr/bin/java" "java" "/usr/lib/jvm/java-8-openjdk-amd64/bin/java" 1
sudo update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java