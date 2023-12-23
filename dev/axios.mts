import axios from 'axios';

console.log(await axios.head('http://replay154.valve.net/570/7501808437_519745192.dem.bz2', { timeout: 5000 }));