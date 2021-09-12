const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8080/');

const duplex = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' });

duplex.pipe(process.stdout);
process.stdin.pipe(duplex);
