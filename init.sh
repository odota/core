sudo add-apt-repository -y ppa:openjdk-r/ppa
sudo apt-get -y update && sudo apt-get -y upgrade
sudo apt-get -y install make g++ build-essential openjdk-8-jdk git maven jq
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
#following won't work on c9 hosted workspaces due to nested docker
#install docker, launch postgres/redis with docker
#curl -sSL https://get.docker.com/ | sh
#sudo docker run -d --name postgres --net=host postgres:latest
#sudo docker run -d --name redis --net=host redis:latest
#sudo docker run -d --name cassandra --net=host cassandra:latest