import { WebSocketServer, WebSocket } from 'ws';

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

const wss = new WebSocketServer({ host: '0.0.0.0', port: 3031 });

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

console.log('WebSocket server running on ws://0.0.0.0:3031');
