sudo add-apt-repository -y ppa:openjdk-r/ppa
#following needed on hosted c9 due to c9.list being read-only
####
sudo touch /etc/apt/sources.list.d/openjdk.list
sudo echo 'deb http://ppa.launchpad.net/openjdk-r/ppa/ubuntu trusty main' >> /etc/apt/sources.list.d/openjdk.list
sudo echo 'deb-src http://ppa.launchpad.net/openjdk-r/ppa/ubuntu trusty main' >> /etc/apt/sources.list.d/openjdk.list 
####
sudo apt-get -y update && sudo apt-get -y upgrade
sudo apt-get -y install make g++ build-essential openjdk-8-jdk git maven
NODE_VERSION=5.8.0
echo "" > /root/.bashrc && \
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash && \
. /root/.bashrc && \
source ~/.bashrc && \
nvm install $NODE_VERSION && \
nvm alias default $NODE_VERSION && \
nvm use $NODE_VERSION && \
npm install -g npm

#following to point default java to java 8
####
sudo update-alternatives --install "/usr/bin/java" "java" "/usr/lib/jvm/java-8-openjdk-amd64/bin/java" 1
sudo update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java
sudo apt-get -y remove maven2
sudo rm -f /usr/bin/javac
sudo ln -s /usr/lib/jvm/java-8-openjdk-amd64/bin/javac /usr/bin/javac
####

#following won't work on c9 hosted workspaces due to nested docker
#install docker, launch postgres/redis with docker
#curl -sSL https://get.docker.com/ | sh
#sudo docker run -d --name postgres --net=host postgres:latest
#sudo docker run -d --name redis --net=host redis:latest
#sudo docker run -d --name cassandra --net=host cassandra:latest

#install infra dependencies via apt-get (if not dockerable)
sudo rm -f /etc/apt/sources.list.d/postgresql.list		
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ trusty-pgdg main" >> /etc/apt/sources.list.d/postgresql.list'
curl -L http://debian.datastax.com/debian/repo_key | sudo apt-key add -
sudo add-apt-repository -y ppa:chris-lea/redis-server
sudo apt-get -y update
sudo apt-get -y install redis-server postgresql-9.5

#cassandra not needed for small deployments
#sudo rm -f /etc/apt/sources.list.d/cassandra.sources.list
#echo "deb http://debian.datastax.com/community stable main" | sudo tee -a /etc/apt/sources.list.d/cassandra.sources.list
#sudo apt-get -y install cassandra

#clean up old versions
sudo apt-get -y purge postgresql-9.3