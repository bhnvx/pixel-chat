import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';

const APP_VERSION = '1.0.0';
const HTTP_PORT = 3030;
const WS_PORT = 3031;
const PUBLIC_DIR = join(__dirname, '..', 'public');

// --- HTTP Server (버전 체크 + 프론트엔드 서빙) ---

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: APP_VERSION }));
    return;
  }

  let filePath = join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url!);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(PUBLIC_DIR, 'index.html');
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on http://0.0.0.0:${HTTP_PORT}`);
  console.log(`App version: ${APP_VERSION}`);
});

// --- WebSocket Server ---

interface Player {
  id: string;
  name: string;
  animal: string;
  x: number;
  y: number;
  ws: WebSocket;
}

interface Room {
  code: string;
  players: Map<string, Player>;
}

const rooms = new Map<string, Room>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcast(room: Room, message: object, excludeId?: string) {
  const data = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

function getPlayersState(room: Room): object[] {
  return Array.from(room.players.values()).map(({ id, name, animal, x, y }) => ({
    id, name, animal, x, y,
  }));
}

const wss = new WebSocketServer({ host: '0.0.0.0', port: WS_PORT });

wss.on('connection', (ws) => {
  const playerId = generateId();
  let currentRoom: Room | null = null;

  ws.on('message', (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const code = generateRoomCode();
        const room: Room = { code, players: new Map() };
        const player: Player = {
          id: playerId,
          name: msg.name,
          animal: msg.animal,
          x: 200 + Math.random() * 400,
          y: 200 + Math.random() * 200,
          ws,
        };
        room.players.set(playerId, player);
        rooms.set(code, room);
        currentRoom = room;

        ws.send(JSON.stringify({
          type: 'room_joined',
          roomCode: code,
          playerId,
          players: getPlayersState(room),
        }));
        break;
      }

      case 'join_room': {
        const room = rooms.get(msg.roomCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: '방을 찾을 수 없습니다.' }));
          return;
        }
        const player: Player = {
          id: playerId,
          name: msg.name,
          animal: msg.animal,
          x: 200 + Math.random() * 400,
          y: 200 + Math.random() * 200,
          ws,
        };
        room.players.set(playerId, player);
        currentRoom = room;

        ws.send(JSON.stringify({
          type: 'room_joined',
          roomCode: room.code,
          playerId,
          players: getPlayersState(room),
        }));

        broadcast(room, {
          type: 'player_joined',
          player: { id: playerId, name: msg.name, animal: msg.animal, x: player.x, y: player.y },
        }, playerId);
        break;
      }

      case 'move': {
        if (!currentRoom) return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        player.x = msg.x;
        player.y = msg.y;
        broadcast(currentRoom, {
          type: 'player_moved',
          playerId,
          x: msg.x,
          y: msg.y,
        }, playerId);
        break;
      }

      case 'chat': {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: 'chat_message',
          playerId,
          message: msg.message,
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.players.delete(playerId);
      broadcast(currentRoom, { type: 'player_left', playerId });
      if (currentRoom.players.size === 0) {
        rooms.delete(currentRoom.code);
      }
    }
  });
});

console.log(`WebSocket server running on ws://0.0.0.0:${WS_PORT}`);
