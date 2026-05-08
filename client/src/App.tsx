import React, { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

const LOCAL_VERSION = '1.0.0';

export interface GameState {
  roomCode: string;
  playerId: string;
  players: PlayerData[];
}

export interface PlayerData {
  id: string;
  name: string;
  animal: string;
  x: number;
  y: number;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [updating, setUpdating] = useState(true);

  useEffect(() => {
    const serverIp = import.meta.env.VITE_SERVER_IP || '127.0.0.1';
    const httpPort = import.meta.env.VITE_HTTP_PORT || '3030';

    fetch(`http://${serverIp}:${httpPort}/api/version`, { signal: AbortSignal.timeout(3000) })
      .then((res) => res.json())
      .then((data) => {
        if (data.version !== LOCAL_VERSION) {
          window.location.href = `http://${serverIp}:${httpPort}`;
        } else {
          setUpdating(false);
        }
      })
      .catch(() => {
        setUpdating(false);
      });
  }, []);

  if (updating) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(26, 26, 46, 0.92)', color: '#888',
        fontFamily: 'Courier New, monospace',
      }}>
        버전 확인 중...
      </div>
    );
  }

  const getInvoke = () => (window as any).__TAURI__?.core?.invoke;

  const handleJoin = (state: GameState, socket: WebSocket) => {
    getInvoke()?.('enter_overlay');
    setGameState(state);
    setWs(socket);
  };

  const handleLeave = () => {
    getInvoke()?.('exit_overlay');
    ws?.close();
    setWs(null);
    setGameState(null);
  };

  if (!gameState || !ws) {
    return <Lobby onJoin={handleJoin} />;
  }

  return (
    <GameRoom
      initialState={gameState}
      ws={ws}
      onLeave={handleLeave}
    />
  );
}
