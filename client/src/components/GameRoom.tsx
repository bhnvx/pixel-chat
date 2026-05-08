import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, PlayerData } from '../App';
import { ANIMALS } from '../assets/animals';

const getInvoke = () => (window as any).__TAURI__?.core?.invoke;

interface ChatBubble {
  playerId: string;
  message: string;
  timestamp: number;
}

interface ChatHistory {
  name: string;
  message: string;
  timestamp: number;
}

interface GameRoomProps {
  initialState: GameState;
  ws: WebSocket;
  onLeave: () => void;
}

const PIXEL_SIZE = 6;
const BUBBLE_DURATION = 4000;
const MAX_HISTORY = 100;

export default function GameRoom({ initialState, ws, onLeave }: GameRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [players, setPlayers] = useState<Map<string, PlayerData>>(
    () => new Map(initialState.players.map((p) => [p.id, p]))
  );
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<{ name: string; x: number; y: number } | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<{ playerId: string; image: string; timestamp: number } | null>(null);
  const playersRef = useRef(players);
  const bubblesRef = useRef(chatBubbles);
  const historyEndRef = useRef<HTMLDivElement>(null);

  playersRef.current = players;
  bubblesRef.current = chatBubbles;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'player_joined':
          setPlayers((prev) => {
            const next = new Map(prev);
            next.set(msg.player.id, msg.player);
            return next;
          });
          break;
        case 'player_moved':
          setPlayers((prev) => {
            const next = new Map(prev);
            const player = next.get(msg.playerId);
            if (player) {
              next.set(msg.playerId, { ...player, x: msg.x, y: msg.y });
            }
            return next;
          });
          break;
        case 'player_left':
          setPlayers((prev) => {
            const next = new Map(prev);
            next.delete(msg.playerId);
            return next;
          });
          break;
        case 'chat_message': {
          setChatBubbles((prev) => [
            ...prev.filter((b) => b.playerId !== msg.playerId),
            { playerId: msg.playerId, message: msg.message, timestamp: Date.now() },
          ]);
          const senderName = playersRef.current.get(msg.playerId)?.name || '???';
          setChatHistory((prev) => {
            const next = [...prev, { name: senderName, message: msg.message, timestamp: Date.now() }];
            if (next.length > MAX_HISTORY) next.shift();
            return next;
          });
          break;
        }
        case 'screenshot_shared': {
          setScreenshotPreview({ playerId: msg.playerId, image: msg.image, timestamp: Date.now() });
          const senderName = playersRef.current.get(msg.playerId)?.name || '???';
          setChatHistory((prev) => {
            const next = [...prev, { name: senderName, message: '[스크린샷]', timestamp: Date.now() }];
            if (next.length > MAX_HISTORY) next.shift();
            return next;
          });
          break;
        }
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  useEffect(() => {
    if (showHistory) historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showHistory]);

  useEffect(() => {
    if (!screenshotPreview) return;
    const timer = setTimeout(() => setScreenshotPreview(null), 8000);
    return () => clearTimeout(timer);
  }, [screenshotPreview]);

  useEffect(() => {
    const interval = setInterval(() => {
      setChatBubbles((prev) =>
        prev.filter((b) => Date.now() - b.timestamp < BUBBLE_DURATION)
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleCanvasHover = (e: React.MouseEvent) => {
    if (isDragging) {
      const me = playersRef.current.get(initialState.playerId);
      if (me) setHoveredPlayer({ name: me.name, x: e.clientX, y: e.clientY });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found: PlayerData | null = null;
    for (const p of playersRef.current.values()) {
      const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
      if (dist < 35) { found = p; break; }
    }
    setHoveredPlayer(found ? { name: found.name, x: e.clientX, y: e.clientY } : null);
  };

  const ignoringRef = useRef(true);

  useEffect(() => {
    const inv = getInvoke();
    if (!inv) return;

    const poll = async () => {
      try {
        const pos: { x: number; y: number } = await inv('get_cursor_position');
        const el = document.elementFromPoint(pos.x, pos.y);
        const isUI = el && (
          el.tagName === 'INPUT' ||
          el.tagName === 'BUTTON' ||
          el.closest('[data-interactive]') !== null
        );

        let shouldIgnore = true;

        if (isUI) {
          shouldIgnore = false;
        } else {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const x = pos.x - rect.left;
            const y = pos.y - rect.top;
            for (const p of playersRef.current.values()) {
              if (Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < 35) {
                shouldIgnore = false;
                break;
              }
            }
          }
        }

        if (shouldIgnore !== ignoringRef.current) {
          ignoringRef.current = shouldIgnore;
          inv('set_ignore_cursor_events', { ignore: shouldIgnore });
        }
      } catch {}
    };

    const interval = setInterval(poll, 50);
    return () => clearInterval(interval);
  }, []);

  const drawAnimal = useCallback((ctx: CanvasRenderingContext2D, player: PlayerData) => {
    const animalDef = ANIMALS.find((a) => a.name === player.animal) || ANIMALS[0];
    const offsetX = player.x - (animalDef.pixels[0].length * PIXEL_SIZE) / 2;
    const offsetY = player.y - (animalDef.pixels.length * PIXEL_SIZE) / 2;

    animalDef.pixels.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        switch (cell) {
          case 'fill': ctx.fillStyle = animalDef.color; break;
          case 'e': ctx.fillStyle = '#111'; break;
          case 'n': ctx.fillStyle = '#ff6b6b'; break;
          case 'b': ctx.fillStyle = '#ffa726'; break;
          case 'w': ctx.fillStyle = '#ffffff'; break;
          default: ctx.fillStyle = animalDef.color;
        }
        ctx.fillRect(
          offsetX + x * PIXEL_SIZE,
          offsetY + y * PIXEL_SIZE,
          PIXEL_SIZE,
          PIXEL_SIZE
        );
      });
    });

    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    const nameY = player.y + animalDef.pixels.length * PIXEL_SIZE / 2 + 18;
    const nameWidth = ctx.measureText(player.name).width + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(player.x - nameWidth / 2, nameY - 12, nameWidth, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(player.name, player.x, nameY);
  }, []);

  const drawBubble = useCallback((ctx: CanvasRenderingContext2D, player: PlayerData, message: string, canvasW: number) => {
    const animalDef = ANIMALS.find((a) => a.name === player.animal) || ANIMALS[0];
    let bubbleY = player.y - (animalDef.pixels.length * PIXEL_SIZE) / 2 - 36;

    ctx.font = 'bold 11px Courier New';
    const nameText = player.name;
    const nameWidth = ctx.measureText(nameText).width;

    ctx.font = '13px Courier New';
    const msgWidth = ctx.measureText(message).width;

    const padding = 10;
    const bubbleWidth = Math.max(nameWidth, msgWidth) + padding * 2;
    const bubbleHeight = 36;
    let bubbleX = player.x - bubbleWidth / 2;

    if (bubbleX < 4) bubbleX = 4;
    if (bubbleX + bubbleWidth > canvasW - 4) bubbleX = canvasW - 4 - bubbleWidth;
    if (bubbleY - bubbleHeight < 4) bubbleY = bubbleHeight + 4;

    const centerX = bubbleX + bubbleWidth / 2;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY - bubbleHeight, bubbleWidth, bubbleHeight, 6);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(player.x - 5, bubbleY);
    ctx.lineTo(player.x + 5, bubbleY);
    ctx.lineTo(player.x, bubbleY + 7);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e94560';
    ctx.font = 'bold 11px Courier New';
    ctx.fillText(nameText, centerX, bubbleY - 22);

    ctx.fillStyle = '#333';
    ctx.font = '13px Courier New';
    ctx.fillText(message, centerX, bubbleY - 7);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      playersRef.current.forEach((player) => {
        drawAnimal(ctx, player);
      });

      bubblesRef.current.forEach((bubble) => {
        const player = playersRef.current.get(bubble.playerId);
        if (player) {
          drawBubble(ctx, player, bubble.message, canvas.width);
        }
      });

      animFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animFrame);
  }, [drawAnimal, drawBubble]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const me = players.get(initialState.playerId);
    if (!me) return;

    const dist = Math.sqrt((x - me.x) ** 2 + (y - me.y) ** 2);
    if (dist < 30) {
      setIsDragging(true);
    }
  };

  const lastSentRef = useRef(0);

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPlayers((prev) => {
      const next = new Map(prev);
      const me = next.get(initialState.playerId);
      if (me) {
        next.set(initialState.playerId, { ...me, x, y });
      }
      return next;
    });

    const now = Date.now();
    if (now - lastSentRef.current > 50) {
      lastSentRef.current = now;
      ws.send(JSON.stringify({ type: 'move', x, y }));
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDragging) {
      const me = players.get(initialState.playerId);
      if (me) ws.send(JSON.stringify({ type: 'move', x: me.x, y: me.y }));
    }
    setIsDragging(false);
  };

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    ws.send(JSON.stringify({ type: 'chat', message: chatInput.trim() }));
    setChatInput('');
  };

  const lastScreenshotRef = useRef(0);

  const handleScreenshot = async () => {
    const now = Date.now();
    const remaining = 60000 - (now - lastScreenshotRef.current);
    if (remaining > 0) {
      alert(`캡처는 ${Math.ceil(remaining / 1000)}초 후에 가능합니다.`);
      return;
    }
    const inv = getInvoke();
    if (!inv) return;
    try {
      lastScreenshotRef.current = Date.now();
      const image: string = await inv('take_screenshot');
      ws.send(JSON.stringify({ type: 'screenshot', image }));
    } catch (e) {
      console.error('Screenshot failed:', e);
      lastScreenshotRef.current = 0;
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} data-interactive>
        <div style={{ cursor: 'grab', padding: '0.3rem 0', marginRight: '0.5rem' }} onMouseDown={() => getInvoke()?.('start_dragging')}>
          ≡
        </div>
        <span style={styles.roomCode}>방 코드: {initialState.roomCode}</span>
        <button
          style={styles.copyButton}
          onClick={() => navigator.clipboard.writeText(initialState.roomCode).then(() => alert('방 코드가 복사되었습니다.'))}
        >
          복사
        </button>
        <span
          style={{ ...styles.playerCount, cursor: 'pointer', position: 'relative' }}
          onMouseEnter={() => setShowPlayerList(true)}
          onMouseLeave={() => setShowPlayerList(false)}
        >
          접속: {players.size}명
          {showPlayerList && (
            <div style={styles.playerListDropdown}>
              {Array.from(players.values()).map((p) => {
                const animalDef = ANIMALS.find((a) => a.name === p.animal);
                return (
                  <div key={p.id} style={styles.playerListItem}>
                    <span style={{ color: animalDef?.color || '#fff' }}>●</span>
                    <span>{p.name}</span>
                    {p.id === initialState.playerId && <span style={{ color: '#888', fontSize: '0.65rem' }}>(나)</span>}
                  </div>
                );
              })}
            </div>
          )}
        </span>
        <button style={styles.screenshotButton} onClick={handleScreenshot}>
          캡처
        </button>
        <button
          style={styles.historyButton}
          onClick={() => setShowHistory((v) => !v)}
        >
          채팅 기록
        </button>
        <button style={styles.monitorButton} onClick={() => getInvoke()?.('switch_monitor')}>
          모니터 전환
        </button>
        <button style={styles.leaveButton} onClick={onLeave}>나가기</button>
      </div>

      {hoveredPlayer && (
        <div style={{
          position: 'fixed',
          left: hoveredPlayer.x + 12,
          top: hoveredPlayer.y - 8,
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'Courier New, monospace',
          pointerEvents: 'none',
          zIndex: 100,
        }}>
          {hoveredPlayer.name}
        </div>
      )}

      {showHistory && (
        <div style={styles.historyPanel} data-interactive>
          <div style={styles.historyHeader}>
            <span style={{ fontWeight: 'bold' }}>채팅 기록</span>
            <button style={styles.historyClose} onClick={() => setShowHistory(false)}>X</button>
          </div>
          <div style={styles.historyList}>
            {chatHistory.length === 0 && (
              <div style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>아직 채팅이 없습니다.</div>
            )}
            {chatHistory.map((h, i) => (
              <div key={i} style={styles.historyItem}>
                <div style={styles.historyMeta}>
                  <span style={{ color: '#888', fontSize: '0.7rem', flexShrink: 0 }}>{formatTime(h.timestamp)}</span>
                  <span style={{ color: '#e94560', fontWeight: 'bold', flexShrink: 0 }}>{h.name}</span>
                </div>
                <div style={styles.historyMessage}>{h.message}</div>
              </div>
            ))}
            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      {screenshotPreview && (
        <div style={styles.screenshotOverlay} data-interactive onClick={() => setScreenshotPreview(null)}>
          <div style={styles.screenshotCard}>
            <div style={styles.screenshotHeader}>
              <span style={{ color: '#e94560', fontWeight: 'bold' }}>
                {players.get(screenshotPreview.playerId)?.name || '???'}
              </span>
              <span style={{ color: '#888', fontSize: '0.7rem' }}>스크린샷</span>
              <button style={styles.historyClose} onClick={() => setScreenshotPreview(null)}>X</button>
            </div>
            <img src={screenshotPreview.image} style={styles.screenshotImage} alt="screenshot" />
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={(e) => { handleCanvasMouseMove(e); handleCanvasHover(e); }}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => { handleCanvasMouseUp(); setHoveredPlayer(null); }}
      />

      <form style={styles.chatForm} onSubmit={handleChat} data-interactive>
        <input
          style={styles.chatInput}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="메시지를 입력하세요... (Enter로 전송)"
          maxLength={50}
        />
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 1rem',
    background: 'rgba(22, 33, 62, 0.85)',
    borderRadius: '0 0 8px 8px',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  roomCode: {
    color: '#e94560',
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
    fontSize: '0.85rem',
  },
  copyButton: {
    padding: '0.2rem 0.5rem',
    background: '#e94560',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.7rem',
  },
  playerCount: {
    color: '#ccc',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.75rem',
  },
  playerListDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    background: 'rgba(22, 33, 62, 0.95)',
    borderRadius: '6px',
    padding: '0.5rem',
    minWidth: '140px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 20,
  },
  playerListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.25rem 0.4rem',
    fontSize: '0.8rem',
    fontFamily: 'Courier New, monospace',
    color: '#fff',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  screenshotButton: {
    padding: '0.3rem 0.75rem',
    background: '#0f3460',
    border: 'none',
    borderRadius: '6px',
    color: '#ccc',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.7rem',
  },
  screenshotOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    background: 'rgba(0,0,0,0.3)',
  },
  screenshotCard: {
    background: 'rgba(22, 33, 62, 0.95)',
    borderRadius: '10px',
    padding: '0.75rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    maxWidth: '660px',
  },
  screenshotHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.8rem',
  },
  screenshotImage: {
    width: '100%',
    borderRadius: '6px',
    display: 'block',
  } as React.CSSProperties,
  historyButton: {
    padding: '0.3rem 0.75rem',
    background: '#0f3460',
    border: 'none',
    borderRadius: '6px',
    color: '#ccc',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.7rem',
  },
  monitorButton: {
    padding: '0.3rem 0.75rem',
    background: '#0f3460',
    border: 'none',
    borderRadius: '6px',
    color: '#ccc',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.7rem',
  },
  leaveButton: {
    padding: '0.3rem 0.75rem',
    background: 'transparent',
    border: '1px solid #555',
    borderRadius: '6px',
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.75rem',
  },
  historyPanel: {
    position: 'absolute',
    top: '40px',
    right: '1rem',
    width: '300px',
    maxHeight: '400px',
    background: 'rgba(22, 33, 62, 0.95)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 15,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Courier New, monospace',
    color: '#fff',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #0f3460',
    fontSize: '0.8rem',
  },
  historyClose: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'Courier New, monospace',
  },
  historyList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem',
  },
  historyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    padding: '0.3rem 0',
    fontSize: '0.75rem',
    fontFamily: 'Courier New, monospace',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  historyMeta: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
  },
  historyMessage: {
    color: '#ddd',
    paddingLeft: '0.2rem',
    wordBreak: 'break-all',
    lineHeight: '1.4',
  } as React.CSSProperties,
  canvas: {
    flex: 1,
    width: '100%',
    cursor: 'default',
  },
  chatForm: {
    padding: '0.5rem 1rem',
    background: 'rgba(22, 33, 62, 0.85)',
    borderRadius: '8px',
    position: 'absolute',
    bottom: '3.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '400px',
    zIndex: 10,
  },
  chatInput: {
    width: '100%',
    padding: '0.6rem 1rem',
    background: 'rgba(26, 26, 46, 0.9)',
    border: '2px solid #0f3460',
    borderRadius: '8px',
    color: '#fff',
    fontFamily: 'Courier New, monospace',
    fontSize: '0.85rem',
    outline: 'none',
  },
};
