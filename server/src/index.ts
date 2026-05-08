declare const process: NodeJS.Process & { pkg?: boolean; execPath: string };

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, createHash } from 'crypto';
import { config } from 'dotenv';

config({ path: join(process.pkg ? process.execPath + '/..' : join(__dirname, '../..'), '.env') });

const APP_VERSION = '1.0.1';
const HTTP_PORT = 3030;
const WS_PORT = 3031;
const PUBLIC_DIR = join(process.pkg ? process.execPath + '/..' : join(__dirname, '..'), 'public');
const startTime = Date.now();

const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW || 'admin';
const adminSessions = new Set<string>();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => body += chunk.toString());
    req.on('end', () => resolve(body));
  });
}

function getCookie(req: IncomingMessage, name: string): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').find((c) => c.trim().startsWith(name + '='));
  return match ? match.split('=')[1].trim() : null;
}

function isAdminAuthed(req: IncomingMessage): boolean {
  const token = getCookie(req, 'admin_token');
  return !!token && adminSessions.has(token);
}

// --- HTTP Server ---

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getAdminData() {
  const roomList = Array.from(rooms.values()).map((room) => ({
    code: room.code,
    playerCount: room.players.size,
    players: Array.from(room.players.values()).map(({ id, name, animal, ip }) => ({ id, name, animal, ip })),
  }));

  let totalPlayers = 0;
  rooms.forEach((r) => totalPlayers += r.players.size);

  return {
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    totalRooms: rooms.size,
    totalPlayers,
    rooms: roomList,
    blacklist: Array.from(blacklist),
  };
}

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: APP_VERSION }));
    return;
  }

  if (req.url === '/api/admin/login' && req.method === 'POST') {
    const body = await parseBody(req);
    try {
      const { id, pw } = JSON.parse(body);
      if (id === ADMIN_ID && pw === ADMIN_PW) {
        const token = generateToken();
        adminSessions.add(token);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict`,
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: '아이디 또는 비밀번호가 틀렸습니다.' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Invalid request' }));
    }
    return;
  }

  if (req.url === '/api/admin/logout') {
    const token = getCookie(req, 'admin_token');
    if (token) adminSessions.delete(token);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'admin_token=; Path=/; HttpOnly; Max-Age=0',
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/api/admin/delete-room' && req.method === 'POST') {
    if (!isAdminAuthed(req)) { res.writeHead(401); res.end(); return; }
    const body = await parseBody(req);
    const { roomCode } = JSON.parse(body);
    const room = rooms.get(roomCode);
    if (room) {
      room.players.forEach((p) => p.ws.close(1000, 'Room deleted by admin'));
      rooms.delete(roomCode);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/api/admin/kick' && req.method === 'POST') {
    if (!isAdminAuthed(req)) { res.writeHead(401); res.end(); return; }
    const body = await parseBody(req);
    const { roomCode, playerId: kickId } = JSON.parse(body);
    const room = rooms.get(roomCode);
    if (room) {
      const player = room.players.get(kickId);
      if (player) {
        player.ws.close(1000, 'Kicked by admin');
        room.players.delete(kickId);
        broadcast(room, { type: 'player_left', playerId: kickId });
        if (room.players.size === 0) rooms.delete(roomCode);
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/api/admin/blacklist' && req.method === 'POST') {
    if (!isAdminAuthed(req)) { res.writeHead(401); res.end(); return; }
    const body = await parseBody(req);
    const { ip, action } = JSON.parse(body);
    if (action === 'add') {
      blacklist.add(ip);
      rooms.forEach((room) => {
        room.players.forEach((p, id) => {
          if (p.ip === ip) {
            p.ws.close(1008, 'Blocked');
            room.players.delete(id);
            broadcast(room, { type: 'player_left', playerId: id });
          }
        });
        if (room.players.size === 0) rooms.delete(room.code);
      });
    } else if (action === 'remove') {
      blacklist.delete(ip);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, blacklist: Array.from(blacklist) }));
    return;
  }

  if (req.url === '/api/admin') {
    if (!isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAdminData()));
    return;
  }

  if (req.url === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ADMIN_HTML);
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
  console.log(`Admin dashboard: http://localhost:${HTTP_PORT}/admin`);
  console.log(`App version: ${APP_VERSION}`);
});

// --- WebSocket Server ---

interface Player {
  id: string;
  name: string;
  animal: string;
  x: number;
  y: number;
  ip: string;
  ws: WebSocket;
}

const blacklist = new Set<string>();

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

const wss = new WebSocketServer({ host: '0.0.0.0', port: WS_PORT, maxPayload: 10 * 1024 * 1024 });

wss.on('connection', (ws, req) => {
  const playerId = generateId();
  const playerIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').replace('::ffff:', '');
  let currentRoom: Room | null = null;

  if (blacklist.has(playerIp)) {
    ws.close(1008, 'Blocked');
    return;
  }

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
          ip: playerIp,
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
        const nameTaken = Array.from(room.players.values()).some((p) => p.name === msg.name);
        if (nameTaken) {
          ws.send(JSON.stringify({ type: 'error', message: '이미 사용 중인 닉네임입니다.' }));
          return;
        }
        const player: Player = {
          id: playerId,
          name: msg.name,
          animal: msg.animal,
          x: 200 + Math.random() * 400,
          y: 200 + Math.random() * 200,
          ip: playerIp,
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

      case 'screenshot': {
        if (!currentRoom) return;
        broadcast(currentRoom, {
          type: 'screenshot_shared',
          playerId,
          image: msg.image,
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

// --- Admin Dashboard HTML ---

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pixel Chat - Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; background: #1a1a2e; color: #fff; min-height: 100vh; }

  .login-wrap {
    width: 100vw; height: 100vh;
    display: flex; align-items: center; justify-content: center;
  }
  .login-box {
    background: #16213e; padding: 2.5rem; border-radius: 12px;
    border: 1px solid #0f3460; width: 340px; text-align: center;
  }
  .login-box h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .login-box h1 span { color: #e94560; }
  .login-box p { color: #888; font-size: 0.8rem; margin-bottom: 1.5rem; }
  .login-box input {
    width: 100%; padding: 0.7rem 1rem; margin-bottom: 0.75rem;
    background: #1a1a2e; border: 2px solid #0f3460; border-radius: 8px;
    color: #fff; font-family: 'Courier New', monospace; font-size: 0.9rem; outline: none;
  }
  .login-box button {
    width: 100%; padding: 0.75rem; background: #e94560; border: none; border-radius: 8px;
    color: #fff; font-family: 'Courier New', monospace; font-size: 1rem;
    font-weight: bold; cursor: pointer; margin-top: 0.5rem;
  }
  .login-error { color: #e94560; font-size: 0.8rem; margin-top: 0.75rem; }

  .header {
    background: #16213e; padding: 1.25rem 2rem;
    border-bottom: 2px solid #0f3460;
    display: flex; align-items: center; justify-content: space-between;
  }
  .header h1 { font-size: 1.5rem; }
  .header h1 span { color: #e94560; }
  .header-right { display: flex; align-items: center; gap: 1rem; }
  .header .version { color: #888; font-size: 0.85rem; }
  .logout-btn {
    padding: 0.3rem 0.75rem; background: transparent; border: 1px solid #555;
    border-radius: 6px; color: #888; cursor: pointer;
    font-family: 'Courier New', monospace; font-size: 0.75rem;
  }

  .stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;
    padding: 1.5rem 2rem;
  }
  .stat-card {
    background: #16213e; border-radius: 10px; padding: 1.25rem;
    border: 1px solid #0f3460; text-align: center;
  }
  .stat-card .value { font-size: 2rem; font-weight: bold; color: #e94560; }
  .stat-card .label { font-size: 0.8rem; color: #888; margin-top: 0.25rem; }

  .content { padding: 0 2rem 2rem; }
  .section-title { font-size: 1.1rem; margin-bottom: 1rem; color: #ccc; border-bottom: 1px solid #0f3460; padding-bottom: 0.5rem; }

  .rooms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
  .room-card {
    background: #16213e; border-radius: 10px; padding: 1.25rem;
    border: 1px solid #0f3460;
  }
  .room-card .room-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 0.75rem;
  }
  .room-card .room-code { font-size: 1.1rem; font-weight: bold; color: #e94560; }
  .room-card .room-count {
    background: #0f3460; padding: 0.2rem 0.6rem; border-radius: 12px;
    font-size: 0.75rem; color: #ccc;
  }
  .player-row {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.35rem 0; font-size: 0.85rem; color: #ccc;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .player-row:last-child { border-bottom: none; }
  .player-dot { font-size: 0.7rem; }
  .player-ip { color: #555; font-size: 0.65rem; margin-left: auto; }
  .btn-sm {
    padding: 0.15rem 0.4rem; border: none; border-radius: 4px;
    font-family: 'Courier New', monospace; font-size: 0.65rem;
    cursor: pointer; margin-left: 0.3rem;
  }
  .btn-kick { background: #e94560; color: #fff; }
  .btn-ban { background: #ff7043; color: #fff; }
  .btn-del { background: #e94560; color: #fff; font-size: 0.7rem; padding: 0.2rem 0.5rem; }
  .btn-unban { background: #555; color: #fff; }

  .blacklist-section { margin-top: 1.5rem; }
  .bl-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.8rem; color: #ccc; }
  .bl-input { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .bl-input input {
    padding: 0.4rem 0.75rem; background: #1a1a2e; border: 1px solid #0f3460;
    border-radius: 6px; color: #fff; font-family: 'Courier New', monospace; font-size: 0.8rem; outline: none;
  }

  .empty { text-align: center; color: #555; padding: 3rem; font-size: 0.9rem; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #66bb6a; display: inline-block; margin-right: 0.5rem; }
  .refresh-info { color: #555; font-size: 0.75rem; text-align: center; padding: 1rem; }
  .hidden { display: none; }
</style>
</head>
<body>

<div id="loginPage" class="login-wrap">
  <div class="login-box">
    <h1><span>Pixel Chat</span> Admin</h1>
    <p>관리자 로그인</p>
    <input type="text" id="loginId" placeholder="아이디" />
    <input type="password" id="loginPw" placeholder="비밀번호" />
    <button onclick="doLogin()">로그인</button>
    <div id="loginError" class="login-error"></div>
  </div>
</div>

<div id="dashboardPage" class="hidden">
  <div class="header">
    <h1><span>Pixel Chat</span> Admin</h1>
    <div class="header-right">
      <div class="version">
        <span class="status-dot"></span>
        <span id="versionText">v--</span>
      </div>
      <button class="logout-btn" onclick="doLogout()">로그아웃</button>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="value" id="statUptime">--</div>
      <div class="label">Uptime</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statRooms">--</div>
      <div class="label">Active Rooms</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statPlayers">--</div>
      <div class="label">Online Players</div>
    </div>
    <div class="stat-card">
      <div class="value" id="statWsPort">--</div>
      <div class="label">WebSocket Port</div>
    </div>
  </div>

  <div class="content">
    <div class="section-title">Active Rooms</div>
    <div id="roomsContainer" class="rooms-grid">
      <div class="empty">Loading...</div>
    </div>

    <div class="blacklist-section">
      <div class="section-title">Blacklist</div>
      <div class="bl-input">
        <input type="text" id="banIpInput" placeholder="IP 주소" />
        <button class="btn-sm btn-kick" onclick="addBlacklist()">추가</button>
      </div>
      <div id="blacklistContainer"></div>
    </div>
  </div>

  <div class="refresh-info">2초마다 자동 새로고침</div>
</div>

<script>
const ANIMAL_COLORS = {
  cat:'#f4a261', dog:'#8d6e63', rabbit:'#ffb6c1', bird:'#64b5f6', frog:'#66bb6a',
  penguin:'#37474f', bear:'#a1887f', fox:'#ff7043', hamster:'#ffcc80', panda:'#eeeeee',
  owl:'#8d6e63', turtle:'#4caf50', chick:'#ffee58', whale:'#42a5f5', monkey:'#d4a373',
  pig:'#f8bbd0', dragon:'#ab47bc', slime:'#69f0ae', ghost:'#e0e0e0',
};

let refreshTimer = null;

function formatUptime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

async function doLogin() {
  var id = document.getElementById('loginId').value;
  var pw = document.getElementById('loginPw').value;
  var errEl = document.getElementById('loginError');
  errEl.textContent = '';

  try {
    var res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, pw: pw }),
    });
    var data = await res.json();
    if (data.ok) {
      showDashboard();
    } else {
      errEl.textContent = data.message;
    }
  } catch(e) {
    errEl.textContent = '서버 연결 실패';
  }
}

async function doLogout() {
  await fetch('/api/admin/logout');
  if (refreshTimer) clearInterval(refreshTimer);
  document.getElementById('dashboardPage').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('loginId').value = '';
  document.getElementById('loginPw').value = '';
  document.getElementById('loginError').textContent = '';
}

function showDashboard() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('dashboardPage').classList.remove('hidden');
  refresh();
  refreshTimer = setInterval(refresh, 2000);
}

async function refresh() {
  try {
    var res = await fetch('/api/admin');
    if (res.status === 401) { doLogout(); return; }
    var data = await res.json();

    document.getElementById('versionText').textContent = 'v' + data.version;
    document.getElementById('statUptime').textContent = formatUptime(data.uptime);
    document.getElementById('statRooms').textContent = data.totalRooms;
    document.getElementById('statPlayers').textContent = data.totalPlayers;
    document.getElementById('statWsPort').textContent = '${WS_PORT}';

    var container = document.getElementById('roomsContainer');
    if (data.rooms.length === 0) {
      container.innerHTML = '<div class="empty">현재 활성화된 방이 없습니다.</div>';
      return;
    }

    container.innerHTML = data.rooms.map(function(room) {
      var players = room.players.map(function(p) {
        var color = ANIMAL_COLORS[p.animal] || '#888';
        return '<div class="player-row">'
          + '<span class="player-dot" style="color:' + color + '">' + String.fromCharCode(9679) + '</span>'
          + p.name
          + ' <span style="color:#555;font-size:0.7rem">(' + p.animal + ')</span>'
          + '<span class="player-ip">' + p.ip + '</span>'
          + '<button class="btn-sm btn-kick" onclick="kickPlayer(\\x27' + room.code + '\\x27,\\x27' + p.id + '\\x27)">강퇴</button>'
          + '<button class="btn-sm btn-ban" onclick="banPlayer(\\x27' + p.ip + '\\x27)">차단</button>'
          + '</div>';
      }).join('');
      return '<div class="room-card"><div class="room-header">'
        + '<span class="room-code">' + room.code + '</span>'
        + '<span class="room-count">' + room.playerCount + '명</span>'
        + '<button class="btn-sm btn-del" onclick="deleteRoom(\\x27' + room.code + '\\x27)">삭제</button>'
        + '</div>' + players + '</div>';
    }).join('');

    var blContainer = document.getElementById('blacklistContainer');
    if (data.blacklist && data.blacklist.length > 0) {
      blContainer.innerHTML = data.blacklist.map(function(ip) {
        return '<div class="bl-row"><span>' + ip + '</span><button class="btn-sm btn-unban" onclick="removeBlacklist(\\x27' + ip + '\\x27)">해제</button></div>';
      }).join('');
    } else {
      blContainer.innerHTML = '<div style="color:#555;font-size:0.8rem">차단된 IP가 없습니다.</div>';
    }
  } catch(e) {
    document.getElementById('roomsContainer').innerHTML = '<div class="empty">서버 연결 실패</div>';
  }
}

async function deleteRoom(code) {
  await fetch('/api/admin/delete-room', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({roomCode: code}) });
  refresh();
}

async function kickPlayer(code, pid) {
  await fetch('/api/admin/kick', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({roomCode: code, playerId: pid}) });
  refresh();
}

async function banPlayer(ip) {
  if (!confirm(ip + ' 을(를) 차단하시겠습니까?')) return;
  await fetch('/api/admin/blacklist', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ip: ip, action: 'add'}) });
  refresh();
}

async function addBlacklist() {
  var ip = document.getElementById('banIpInput').value.trim();
  if (!ip) return;
  await fetch('/api/admin/blacklist', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ip: ip, action: 'add'}) });
  document.getElementById('banIpInput').value = '';
  refresh();
}

async function removeBlacklist(ip) {
  await fetch('/api/admin/blacklist', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ip: ip, action: 'remove'}) });
  refresh();
}

document.getElementById('loginPw').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

(async function checkSession() {
  try {
    var res = await fetch('/api/admin');
    if (res.ok) showDashboard();
  } catch(e) {}
})();
</script>
</body>
</html>`;
