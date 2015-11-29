#STANDALONE
sudo add-apt-repository ppa:openjdk-r/ppa
sudo apt-get update && sudo apt-get upgrade
sudo apt-get -y install make g++ build-essential redis-server postgresql-9.5 openjdk-8-jdk nodejs-legacy npm curl git maven
sudo npm install -g n && sudo n latest
sudo npm install -g npm
sudo npm run create
sudo update-alternatives --install "/usr/bin/java" "java" "/usr/lib/jvm/java-8-openjdk-amd64/bin/java" 1
sudo update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java