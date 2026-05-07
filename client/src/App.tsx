import React, { useState } from 'react';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

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

  const handleJoin = (state: GameState, socket: WebSocket) => {
    setGameState(state);
    setWs(socket);
  };

  const handleLeave = () => {
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
