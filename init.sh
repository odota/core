sudo add-apt-repository ppa:chris-lea/redis-server
sudo apt-get update && sudo apt-get upgrade
sudo apt-get -y install make g++ build-essential redis-server postgresql-9.5 maven default-jdk nodejs-legacy npm curl git
sudo npm install -g n && sudo n latest
sudo npm install -g npm
sudo npm run create