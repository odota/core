#STANDALONE
sudo rm -f /etc/apt/sources.list.d/cassandra.sources.list
sudo rm -f /etc/apt/sources.list.d/postgresql.list
echo "deb http://debian.datastax.com/community stable main" | sudo tee -a /etc/apt/sources.list.d/cassandra.sources.list
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ trusty-pgdg main" >> /etc/apt/sources.list.d/postgresql.list'
curl -L http://debian.datastax.com/debian/repo_key | sudo apt-key add -
sudo add-apt-repository -y ppa:openjdk-r/ppa
sudo add-apt-repository -y ppa:chris-lea/redis-server
sudo apt-get -y update && sudo apt-get -y upgrade
sudo apt-get -y install make g++ build-essential redis-server postgresql-9.5 openjdk-8-jdk git maven cassandra jq
NODE_VERSION=`jq '.engines.node' package.json`
echo "" > /root/.bashrc && \
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash && \
. /root/.bashrc && \
source ~/.bashrc && \
nvm install $NODE_VERSION && \
nvm alias default $NODE_VERSION && \
nvm use $NODE_VERSION && \
npm install -g npm
sudo update-alternatives --install "/usr/bin/java" "java" "/usr/lib/jvm/java-8-openjdk-amd64/bin/java" 1
sudo update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java
sudo apt-get -y remove maven2
sudo rm -f /usr/bin/javac
sudo ln -s /usr/lib/jvm/java-8-openjdk-amd64/bin/javac /usr/bin/javac