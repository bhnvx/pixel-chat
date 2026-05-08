import React, { useState } from 'react';
import { ANIMALS } from '../assets/animals';
import { GameState } from '../App';
import PixelAnimal from './PixelAnimal';

const getInvoke = () => (window as any).__TAURI__?.core?.invoke;

interface LobbyProps {
  onJoin: (state: GameState, ws: WebSocket) => void;
}

export default function Lobby({ onJoin }: LobbyProps) {
  const [name, setName] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState(ANIMALS[0].name);
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connect = (type: 'create_room' | 'join_room') => {
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (type === 'join_room' && !roomCode.trim()) {
      setError('방 코드를 입력해주세요.');
      return;
    }

    setConnecting(true);
    setError('');

    const SERVER_IP = import.meta.env.VITE_SERVER_IP || '127.0.0.1';
    const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '3031';
    const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type,
        name: name.trim(),
        animal: selectedAnimal,
        roomCode: roomCode.trim().toUpperCase(),
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'room_joined') {
        onJoin({
          roomCode: msg.roomCode,
          playerId: msg.playerId,
          players: msg.players,
        }, ws);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setConnecting(false);
        ws.close();
      }
    };

    ws.onerror = () => {
      setError(`서버에 연결할 수 없습니다. (${SERVER_IP}:${SERVER_PORT})`);
      setConnecting(false);
    };
  };

  return (
    <div style={styles.container}>
      <div style={styles.titleBar} onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('button')) getInvoke()?.('start_dragging');
      }}>
        <span>Pixel Chat</span>
        <button style={styles.closeButton} onMouseDown={(e) => e.stopPropagation()} onClick={() => {
          try { getInvoke()?.('close_app'); } catch {} window.close();
        }}>X</button>
      </div>
      <div style={styles.panel}>
      <h1 style={styles.title}>Pixel Chat</h1>
      <p style={styles.subtitle}>픽셀 동물 채팅</p>

      <div style={styles.form}>
        <input
          style={styles.input}
          placeholder="닉네임"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={10}
        />

        <div style={styles.animalGrid}>
          {ANIMALS.map((animal) => (
            <div
              key={animal.name}
              style={{
                ...styles.animalOption,
                border: selectedAnimal === animal.name
                  ? '3px solid #fff'
                  : '3px solid transparent',
              }}
              onClick={() => setSelectedAnimal(animal.name)}
            >
              <PixelAnimal animal={animal} size={5} />
              <span style={styles.animalName}>{animal.nameKo}</span>
            </div>
          ))}
        </div>

        {mode === 'select' && (
          <div style={styles.buttonRow}>
            <button style={styles.button} onClick={() => setMode('create')}>
              방 만들기
            </button>
            <button style={styles.button} onClick={() => setMode('join')}>
              방 참가하기
            </button>
          </div>
        )}

        {mode === 'create' && (
          <button
            style={styles.button}
            onClick={() => connect('create_room')}
            disabled={connecting}
          >
            {connecting ? '연결 중...' : '새 방 만들기'}
          </button>
        )}

        {mode === 'join' && (
          <div style={styles.joinRow}>
            <input
              style={{ ...styles.input, textTransform: 'uppercase' }}
              placeholder="방 코드"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              maxLength={6}
            />
            <button
              style={styles.button}
              onClick={() => connect('join_room')}
              disabled={connecting}
            >
              {connecting ? '연결 중...' : '참가'}
            </button>
          </div>
        )}

        {mode !== 'select' && (
          <button
            style={styles.backButton}
            onClick={() => { setMode('select'); setError(''); }}
          >
            뒤로
          </button>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a2e',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: '#fff',
    padding: '1rem 2rem 2rem',
    overflowY: 'auto',
  },
  titleBar: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.6rem 1rem',
    cursor: 'grab',
    color: '#555',
    fontSize: '0.75rem',
    fontFamily: 'Courier New, monospace',
    background: '#16213e',
    borderBottom: '1px solid #0f3460',
    flexShrink: 0,
  },
  closeButton: {
    width: '24px',
    height: '24px',
    background: '#e94560',
    border: 'none',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
  },
  title: {
    fontSize: '3rem',
    marginBottom: '0.25rem',
    fontFamily: 'Courier New, monospace',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '2rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    width: '100%',
    maxWidth: '500px',
  },
  input: {
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    background: '#16213e',
    border: '2px solid #0f3460',
    borderRadius: '8px',
    color: '#fff',
    fontFamily: 'Courier New, monospace',
    width: '100%',
    maxWidth: '300px',
    outline: 'none',
  },
  animalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '0.75rem',
    margin: '1rem 0',
  },
  animalOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '8px',
    cursor: 'pointer',
    background: '#16213e',
    transition: 'all 0.2s',
  },
  animalName: {
    fontSize: '0.8rem',
    color: '#ccc',
  },
  buttonRow: {
    display: 'flex',
    gap: '1rem',
  },
  button: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    background: '#e94560',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
  },
  backButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    background: 'transparent',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
  },
  joinRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  error: {
    color: '#e94560',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
  },
};
