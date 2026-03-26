import React, { useState, useEffect, useRef } from 'react';
import { Swords, Users, RefreshCw, Plus } from 'lucide-react';

/* ===================== MULTIPLAYER PROTOCOL =====================

ROUND N
│
├─ both players submit inputs
│   (blackMove + whiteMove exist)
│
├─ both clients animate round N exactly once
│   (locked by animatingRoundId)
│
├─ BLACK resolves round N
│   → writes positions, lives, message
│   → increments roundId to N+1
│
└─ WHITE observes roundId change
    → exits animation
    → round N complete

============================================================== */
/*
if (!window.storage) {
  window.storage = {
    async get(key) {
      return { value: localStorage.getItem(key) }
    },
    async set(key, value) {
      localStorage.setItem(key, value)
    },
    async delete(key) {
      localStorage.removeItem(key)
    },
    async list(prefix) {
      return {
        keys: Object.keys(localStorage).filter(k => k.startsWith(prefix))
      }
    }
  }
}
*/
if (!window.storage) {
  const BASE = 'https://ttd-storage.m450n-5t4h1.workers.dev/api';
  const HEADERS = { 'X-TTD-Key': 'ttd-8f3k1m9x5p2q7' };
  window.storage = {
    async get(key) {
      const r = await fetch(`${BASE}/kv/${encodeURIComponent(key)}`, { headers: HEADERS });
      return r.json();
    },
    async set(key, value) {
      await fetch(`${BASE}/kv/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify({ value }),
      });
    },
    async delete(key) {
      await fetch(`${BASE}/kv/${encodeURIComponent(key)}`, { method: 'DELETE', headers: HEADERS });
    },
    async list(prefix) {
      const r = await fetch(`${BASE}/list?prefix=${encodeURIComponent(prefix)}`, { headers: HEADERS });
      return r.json();
    },
  };
}

/* ===================== CONSTANTS ===================== */

const BOARD_LAYOUT = [
  { q: 0, r: 1, id: 0 }, { q: 0, r: 2, id: 1 }, { q: 0, r: 3, id: 2 },
  { q: 1, r: 0.5, id: 3 }, { q: 1, r: 1.5, id: 4 }, { q: 1, r: 2.5, id: 5 }, { q: 1, r: 3.5, id: 6 },
  { q: 2, r: 0, id: 7 }, { q: 2, r: 1, id: 8 }, { q: 2, r: 2, id: 9 }, { q: 2, r: 3, id: 10 }, { q: 2, r: 4, id: 11 },
  { q: 3, r: 0.5, id: 12 }, { q: 3, r: 1.5, id: 13 }, { q: 3, r: 2.5, id: 14 }, { q: 3, r: 3.5, id: 15 },
  { q: 4, r: 1, id: 16 }, { q: 4, r: 2, id: 17 }, { q: 4, r: 3, id: 18 }
];

const STARTING_POSITIONS = { black: 11, white: 7 };

/* ===================== HELPERS ===================== */

const getAdjacentTiles = (tileId) => {
  const tile = BOARD_LAYOUT.find(t => t.id === tileId);
  if (!tile) return [];
  
  return BOARD_LAYOUT
    .filter(t => t.id !== tileId)
    .filter(t => {
      const dq = Math.abs(t.q - tile.q);
      const dr = Math.abs(t.r - tile.r);
      if (dq > 1 || dr > 1) return false;
      const dist = Math.sqrt(Math.pow((t.q - tile.q) * 52, 2) + Math.pow((t.r - tile.r) * 80, 2));
      return dist < 85;
    })
    .map(t => t.id);
};

const getTileCenter = (tile, isPlayerView) => {
  const size = 40;
  const height = size * 2;
  const width = Math.sqrt(3) * size;
  const x = tile.q * width * 0.82;
  const y = tile.r * height;
  
  if (isPlayerView === 'white') {
    const maxY = Math.max(...BOARD_LAYOUT.map(t => t.r * height));
    return { x, y: maxY - y };
  }
  return { x, y };
};

/* ===================== COMPONENTS ===================== */

const HexTile = ({ tile, player, isFlashing, onClick, isPlayerView }) => {
  const size = 40;
  const center = getTileCenter(tile, isPlayerView);
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push(`${size * Math.cos(angle)},${size * Math.sin(angle)}`);
  }
  
  return (
    <g transform={`translate(${center.x}, ${center.y})`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <polygon points={points.join(' ')} fill="#D4A574" stroke="#8B4513" strokeWidth="2" className={isFlashing ? 'animate-pulse' : ''} />
      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fill="#333" fontSize="14" fontWeight="bold">{tile.id}</text>
      {player && <circle r={size * 0.4} fill={player === 'black' ? '#000' : '#fff'} stroke={player === 'black' ? '#fff' : '#000'} strokeWidth="2" />}
    </g>
  );
};

const MoveArrow = ({ fromTile, toTile, color, isPlayerView }) => {
  const from = getTileCenter(fromTile, isPlayerView);
  const to = getTileCenter(toTile, isPlayerView);
  const dx = to.x - from.x, dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);
  const startX = from.x + Math.cos(angle) * 20, startY = from.y + Math.sin(angle) * 20;
  const endX = to.x - Math.cos(angle) * 20, endY = to.y - Math.sin(angle) * 20;
  
  return (
    <g>
      <defs>
        <marker id={`arrow-${color}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill={color === 'black' ? '#000' : '#fff'} />
        </marker>
      </defs>
      <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={color === 'black' ? '#000' : '#fff'} strokeWidth="3" markerEnd={`url(#arrow-${color})`} />
    </g>
  );
};

const AttackX = ({ tile, isPlayerView, color }) => {
  const center = getTileCenter(tile, isPlayerView);
  const strokeColor = color === 'black' ? '#000' : '#fff';
  return (
    <g transform={`translate(${center.x}, ${center.y})`} className="animate-pulse">
      <line x1="-20" y1="-20" x2="20" y2="20" stroke={strokeColor} strokeWidth="5" />
      <line x1="20" y1="-20" x2="-20" y2="20" stroke={strokeColor} strokeWidth="5" />
    </g>
  );
};

// EDIT HERE: Add animation rendering - sliding pieces and growing Xs
const AnimatedPiece = ({ fromTile, toTile, color, isPlayerView, progress }) => {
  const from = getTileCenter(fromTile, isPlayerView);
  const to = getTileCenter(toTile, isPlayerView);
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={16} fill={color === 'black' ? '#000' : '#fff'} stroke={color === 'black' ? '#fff' : '#000'} strokeWidth="2" />
    </g>
  );
};

const GameBoard = ({ gameState, onMove, onAttack, phase, playerColor, pendingMove, pendingAttack, animation }) => {
  const currentPos = playerColor === 'black' ? gameState.blackPos : gameState.whitePos;
  const opponentColor = playerColor === 'black' ? 'white' : 'black';
  const opponentPos = playerColor === 'black' ? gameState.whitePos : gameState.blackPos;
  
  const moveOptions = phase === 'move' ? [currentPos, ...getAdjacentTiles(currentPos)] : [];
  const attackOptions = phase === 'attack' && pendingMove ? getAdjacentTiles(pendingMove) : [];
  
  const handleClick = (tileId) => {
    if (phase === 'move' && moveOptions.includes(tileId)) onMove(tileId);
    else if (phase === 'attack' && attackOptions.includes(tileId)) onAttack(tileId);
  };
  
  const minX = -55, maxX = 280, minY = -80, maxY = 400;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  
  return (
    <svg viewBox={viewBox} className="w-full h-full">
      {BOARD_LAYOUT.map(tile => {
        const isPlayerHere = !animation && currentPos === tile.id;
        const isOpponentHere = !animation && opponentPos === tile.id;
        const player = isPlayerHere ? playerColor : isOpponentHere ? opponentColor : null;
        const isFlashing = moveOptions.includes(tile.id) || attackOptions.includes(tile.id);
        
        return <HexTile key={tile.id} tile={tile} player={player} isFlashing={isFlashing} 
                        onClick={isFlashing ? () => handleClick(tile.id) : null} isPlayerView={playerColor} />;
      })}
      
      {/* Show pending actions */}
      {pendingMove && !animation && (
        <MoveArrow fromTile={BOARD_LAYOUT.find(t => t.id === currentPos)} 
                   toTile={BOARD_LAYOUT.find(t => t.id === pendingMove)} 
                   color={playerColor} isPlayerView={playerColor} />
      )}
      {pendingAttack && phase === 'attack' && !animation && (
        <AttackX tile={BOARD_LAYOUT.find(t => t.id === pendingAttack)} isPlayerView={playerColor} color={playerColor} />
      )}
      
      {/* EDIT HERE: Animation rendering - first 60% movement, last 40% attacks */}
      {animation && (
        <>
          {animation.progress <= 0.6 && (
            <>
              <AnimatedPiece fromTile={BOARD_LAYOUT.find(t => t.id === animation.playerStart)} 
                            toTile={BOARD_LAYOUT.find(t => t.id === animation.playerMove)}
                            color={playerColor} isPlayerView={playerColor} progress={animation.progress / 0.6} />
              <AnimatedPiece fromTile={BOARD_LAYOUT.find(t => t.id === animation.opponentStart)} 
                            toTile={BOARD_LAYOUT.find(t => t.id === animation.opponentMove)}
                            color={opponentColor} isPlayerView={playerColor} progress={animation.progress / 0.6} />
            </>
          )}
          {animation.progress > 0.6 && (
            <>
              <AnimatedPiece fromTile={BOARD_LAYOUT.find(t => t.id === animation.playerMove)} 
                            toTile={BOARD_LAYOUT.find(t => t.id === animation.playerMove)}
                            color={playerColor} isPlayerView={playerColor} progress={1} />
              <AnimatedPiece fromTile={BOARD_LAYOUT.find(t => t.id === animation.opponentMove)} 
                            toTile={BOARD_LAYOUT.find(t => t.id === animation.opponentMove)}
                            color={opponentColor} isPlayerView={playerColor} progress={1} />
              <AttackX tile={BOARD_LAYOUT.find(t => t.id === animation.playerAttack)} isPlayerView={playerColor} color={playerColor} />
              <AttackX tile={BOARD_LAYOUT.find(t => t.id === animation.opponentAttack)} isPlayerView={playerColor} color={opponentColor} />
            </>
          )}
        </>
      )}
    </svg>
  );
};

/* ===================== MAIN COMPONENT ===================== */

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [games, setGames] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [winner, setWinner] = useState(null);
  

  const [phase, setPhase] = useState('move');
  const [pendingMove, setPendingMove] = useState(null);
  const [pendingAttack, setPendingAttack] = useState(null);
  const [animation, setAnimation] = useState(null);
  const [resolutionMessage, setResolutionMessage] = useState('');
  const lastSeenRoundId = useRef(null);
  const animatingRoundId = useRef(null);
  const pollingInterval = useRef(null);
  const animationInterval = useRef(null);

  useEffect(() => {
    if (screen !== 'lobby') return;
    loadGames();
    const interval = setInterval(loadGames, 2000);
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    const savedId = localStorage.getItem('ttd_gameId');
    const savedColor = localStorage.getItem('ttd_color');
    if (!savedId || !savedColor) return;

    (async () => {
      try {
        const result = await window.storage.get(savedId);
        if (!result?.value) { localStorage.removeItem('ttd_gameId'); localStorage.removeItem('ttd_color'); return; }

        const game = JSON.parse(result.value);
        const myMove = savedColor === 'black' ? game.blackMove : game.whiteMove;
        const restoredPhase = myMove !== null ? 'waiting' : 'move';

        setCurrentGame({ id: savedId, ...game });
        setPlayerColor(savedColor);
        lastSeenRoundId.current = game.roundId;

        if (game.blackLives === 0 || game.whiteLives === 0) {
          setWinner(game.blackLives === 0 ? 'white' : 'black');
          setScreen('gameover');
          startGamePolling(savedId, savedColor);
        } else {
          setPhase(restoredPhase);
          setScreen('game');
          startGamePolling(savedId, savedColor);
        }
      } catch { localStorage.removeItem('ttd_gameId'); localStorage.removeItem('ttd_color'); }
    })();
  }, []);

  /* ===================== LOBBY ===================== */

  const loadGames = async () => {
    try {
      const result = await window.storage.list('game:', true);
      if (result?.keys) {
        const gameData = await Promise.all(
          result.keys.map(async key => {
            try {
              const data = await window.storage.get(key, true);
              return data ? { id: key, ...JSON.parse(data.value) } : null;
            } catch { return null; }
          })
        );
        setGames(gameData.filter(g => g?.status === 'waiting'));
      }
    } catch { setGames([]); }
  };

  const createGame = async () => {
	  const gameId = `game:${Date.now()}`;
	  const newGame = {
		status: 'waiting',
		blackPlayer: true,
		whitePlayer: false,

		blackPos: STARTING_POSITIONS.black,
		whitePos: STARTING_POSITIONS.white,

		blackLives: 3,
		whiteLives: 3,

		blackMove: null,
		whiteMove: null,
		blackAttack: null,
		whiteAttack: null,
		blackStartPos: null,
		whiteStartPos: null,

		// ✅ protocol fields
		roundId: 0,
		resolutionMessage: ''
	  };

	  await window.storage.set(gameId, JSON.stringify(newGame), true);
	  setCurrentGame({ id: gameId, ...newGame });
    lastSeenRoundId.current = 0;
	  setPlayerColor('black');
    localStorage.setItem('ttd_gameId', gameId);
    localStorage.setItem('ttd_color', 'black');
	  setScreen('game');
	  startGamePolling(gameId, 'black');
	};


  const joinGame = async (gameId) => {
    try {
      const result = await window.storage.get(gameId, true);
      const game = JSON.parse(result.value);
      game.whitePlayer = true;
      game.status = 'playing';
      await window.storage.set(gameId, JSON.stringify(game), true);
      setCurrentGame({ id: gameId, ...game });
      lastSeenRoundId.current = 0;
      setPlayerColor('white');
      localStorage.setItem('ttd_gameId', gameId);
      localStorage.setItem('ttd_color', 'white');
      setScreen('game');
      startGamePolling(gameId, 'white');
    } catch (e) { console.error('Join failed', e); }
  };

  /* ===================== POLLING ===================== */

  const startGamePolling = (gameId, color) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    
    console.log('POLL SETUP: Starting polling with color:', color);
    
    pollingInterval.current = setInterval(async () => {
      try {
        const result = await window.storage.get(gameId, true);
        if (!result) {
          console.log('POLL: No result from storage');
          return;
        }

        const game = JSON.parse(result.value);
        console.log('POLL: Got game state', {
          blackPos: game.blackPos,
          whitePos: game.whitePos,
          blackMove: game.blackMove,
          whiteMove: game.whiteMove,
          currentPhase: phase,
          myColor: color
        });
        
      // Animate when BOTH players have submitted for THIS round
      const animRound = game.roundId; // ← this is the round being played NOW
      
      if (
        game.blackMove &&
        game.whiteMove &&
        animatingRoundId.current !== game.roundId
      ) {
        animatingRoundId.current = game.roundId;

        playAnimation(
          {
            roundId: game.roundId,
            blackStartPos: game.blackStartPos,
            whiteStartPos: game.whiteStartPos,
            blackMove: game.blackMove,
            whiteMove: game.whiteMove,
            blackAttack: game.blackAttack,
            whiteAttack: game.whiteAttack
          },
          color,
          gameId
        );
}


        setCurrentGame({ id: gameId, ...game });
	    	setResolutionMessage(game.resolutionMessage || '');

        // ROUND ADVANCED → hard reset local client
        if (
          lastSeenRoundId.current !== null &&
          game.roundId > lastSeenRoundId.current
        ) {
          lastSeenRoundId.current = game.roundId;

          animatingRoundId.current = null;
          if (animationInterval.current) {
            clearInterval(animationInterval.current);
            animationInterval.current = null;
          }
          setAnimation(null);

          setPhase('move');
          setPendingMove(null);
          setPendingAttack(null);
          setResolutionMessage('');
        }

        // REMATCH → both players flagged, black resets the game
        if (game.blackRematch && game.whiteRematch && color === 'black') {
          const resetGame = {
            ...game,
            status: 'playing',
            blackPos: STARTING_POSITIONS.black,
            whitePos: STARTING_POSITIONS.white,
            blackLives: 3,
            whiteLives: 3,
            blackMove: null, whiteMove: null,
            blackAttack: null, whiteAttack: null,
            blackStartPos: null, whiteStartPos: null,
            blackRematch: false, whiteRematch: false,
            roundId: 0,
            resolutionMessage: '',
          };
          await window.storage.set(gameId, JSON.stringify(resetGame), true);
        }

        // REMATCH detected by either player → re-enter game screen
        if (game.blackRematch && game.whiteRematch) {
          lastSeenRoundId.current = 0;
          animatingRoundId.current = null;
          setAnimation(null);
          setPhase('move');
          setPendingMove(null);
          setPendingAttack(null);
          setResolutionMessage('');
          setWinner(null);
          setScreen('game');
        }
        
        if (game.blackLives === 0 || game.whiteLives === 0) {
          setWinner(game.blackLives === 0 ? 'white' : 'black');
          setScreen('gameover');
          // keep polling alive so rematch can be detected
        }
      } catch (e) { console.error('Poll error', e); }
    }, 400);
  };

  /* ===================== ANIMATION ===================== */

  const playAnimation = (gameSnapshot, color, gameId) => {
	if (animatingRoundId.current !== gameSnapshot.roundId) return;
    console.log('ANIMATION: Starting animation with snapshot', {
      playerColor: color,
      gameId: gameId,
      blackPos: gameSnapshot.blackPos,
      whitePos: gameSnapshot.whitePos,
      blackMove: gameSnapshot.blackMove,
      whiteMove: gameSnapshot.whiteMove,
      blackAttack: gameSnapshot.blackAttack,
      whiteAttack: gameSnapshot.whiteAttack
    });
    setPhase('animating');

  const anim = {
    playerStart:
      color === 'black'
        ? gameSnapshot.blackStartPos
        : gameSnapshot.whiteStartPos,

    playerMove:
      color === 'black'
        ? gameSnapshot.blackMove
        : gameSnapshot.whiteMove,

    playerAttack:
      color === 'black'
        ? gameSnapshot.blackAttack
        : gameSnapshot.whiteAttack,

    opponentStart:
      color === 'black'
        ? gameSnapshot.whiteStartPos
        : gameSnapshot.blackStartPos,

    opponentMove:
      color === 'black'
        ? gameSnapshot.whiteMove
        : gameSnapshot.blackMove,

    opponentAttack:
      color === 'black'
        ? gameSnapshot.whiteAttack
        : gameSnapshot.blackAttack,

    progress: 0
  };


    console.log('ANIMATION: Animation data', anim);
    setAnimation(anim);

    if (animationInterval.current) clearInterval(animationInterval.current);
    animationInterval.current = setInterval(async () => {
      anim.progress += 0.015;
      
		if (anim.progress >= 1) {
		  clearInterval(animationInterval.current);
		  animationInterval.current = null;

		  // BLACK: resolve the round exactly once
		  if (color === 'black') {
        const result = await window.storage.get(gameId, true);
        const freshGame = JSON.parse(result.value);
        await resolveRound(freshGame, gameId);

      } else {
        // WHITE: wait for roundId to advance
        console.log('ANIMATION: White waiting for round resolution');
        }
      } else {
          setAnimation({ ...anim });
        }
      }, 30);
    };

  /* ===================== RESOLUTION ===================== */

  const resolveRound = async (game, gameId) => {
    console.log('=== RESOLVE ROUND START ===');
    console.log('Current state:', {
      blackPos: game.blackPos,
      whitePos: game.whitePos,
      blackMove: game.blackMove,
      whiteMove: game.whiteMove,
      blackAttack: game.blackAttack,
      whiteAttack: game.whiteAttack,
      blackStartPos: game.blackStartPos,
      whiteStartPos: game.whiteStartPos
    });
    
    let newBlackPos = game.blackMove;
    let newWhitePos = game.whiteMove;
    
    console.log('Initial new positions:', { newBlackPos, newWhitePos });
    
    let blackHit = false;
    let whiteHit = false;
    let collision = false;
    const messageParts = [];

    // Check for collision FIRST, push back to round start positions
    if (newBlackPos === newWhitePos) {
      console.log('Collision detected! Pushing back to round start');
      collision = true;
      messageParts.push('Collision! Both players pushed back.');
      newBlackPos = game.blackStartPos;
      newWhitePos = game.whiteStartPos;
    }

    // Check attacks against FINAL positions (after any collision pushback)
    {
      if (game.blackAttack === newWhitePos) {
        console.log('Black hit white!');
        game.whiteLives--;
        whiteHit = true;
      }
      if (game.whiteAttack === newBlackPos) {
        console.log('White hit black!');
        game.blackLives--;
        blackHit = true;
      }
      
      // Reset hit players to spawn
      if (blackHit) {
        console.log('Black was hit, resetting to spawn');
        messageParts.push('Black was hit! Reset to spawn.');
        newBlackPos = STARTING_POSITIONS.black;
      }
      if (whiteHit) {
        console.log('White was hit, resetting to spawn');
        messageParts.push('White was hit! Reset to spawn.');
        newWhitePos = STARTING_POSITIONS.white;
      }
    }

    const message = messageParts.join(' ');
    
    console.log('Final positions after all checks:', { newBlackPos, newWhitePos });
    
    // Commit positions
    game.blackPos = newBlackPos;
    game.whitePos = newWhitePos;
	
    game.lastResolvedRound = {
      roundId: game.roundId,
      blackStartPos: game.blackStartPos,
      whiteStartPos: game.whiteStartPos,
      blackMove: game.blackMove,
      whiteMove: game.whiteMove,
      blackAttack: game.blackAttack,
      whiteAttack: game.whiteAttack,
      resolutionMessage: message
    };

    // Clear turn inputs BEFORE incrementing roundId
    game.blackMove = null;
    game.whiteMove = null;
    game.blackAttack = null;
    game.whiteAttack = null;
    game.blackStartPos = null;
    game.whiteStartPos = null;
    
    // Set resolution message
    game.resolutionMessage = message;
    
    // Increment roundId LAST - this signals round is complete
    game.roundId += 1;

    await window.storage.set(gameId, JSON.stringify(game), true);
    console.log('=== RESOLVE ROUND COMPLETE - NEW ROUND:', game.roundId, '===');
  };

  /* ===================== TURN INPUT ===================== */

  const handleMove = (tileId) => {
    setPendingMove(tileId);
    setPendingAttack(null);
    setPhase('attack');
  };

  const handleAttack = (tileId) => {
    setPendingAttack(tileId);
  };

  const undoTurn = () => {
    setPendingMove(null);
    setPendingAttack(null);
    setPhase('move');
  };

  const confirmTurn = async () => {
    if (!pendingMove || !pendingAttack || phase === 'waiting') return;

    console.log('CONFIRM: Starting turn confirmation', {
      playerColor,
      pendingMove,
      pendingAttack,
      currentPhase: phase
    });

    setPhase('waiting');

    try {
      const result = await window.storage.get(currentGame.id, true);
      const game = JSON.parse(result.value);
      
      console.log('CONFIRM: Current game state before update', {
        blackPos: game.blackPos,
        whitePos: game.whitePos,
        blackMove: game.blackMove,
        whiteMove: game.whiteMove
      });

      if (playerColor === 'black') {
        game.blackMove = pendingMove;
        game.blackAttack = pendingAttack;
        game.blackStartPos = game.blackPos; // Store current position as start position
        console.log('CONFIRM: Black player updating', {
          blackMove: pendingMove,
          blackAttack: pendingAttack,
          blackStartPos: game.blackPos
        });
      } else {
        game.whiteMove = pendingMove;
        game.whiteAttack = pendingAttack;
        game.whiteStartPos = game.whitePos; // Store current position as start position
        console.log('CONFIRM: White player updating', {
          whiteMove: pendingMove,
          whiteAttack: pendingAttack,
          whiteStartPos: game.whitePos
        });
      }

      console.log('CONFIRM: Saving updated game state');
      await window.storage.set(currentGame.id, JSON.stringify(game), true);
      console.log('CONFIRM: Save complete');
    } catch (e) {
      console.error('Confirm error', e);
      setPhase('attack');
    }
  };

  const goToLobby = async () => {
    localStorage.removeItem('ttd_gameId');
    localStorage.removeItem('ttd_color');
    if (currentGame) await window.storage.delete(currentGame.id, true);
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    if (animationInterval.current) { clearInterval(animationInterval.current); animationInterval.current = null; }
    setScreen('lobby');
    setCurrentGame(null);
    setPlayerColor(null);
    setWinner(null);
    setPendingMove(null);
    setPendingAttack(null);
    setPhase('move');
    setAnimation(null);
    lastSeenRoundId.current = null;
  };

  const requestRematch = async () => {
    if (!currentGame) return;
    const result = await window.storage.get(currentGame.id, true);
    const game = JSON.parse(result.value);
    if (playerColor === 'black') game.blackRematch = true;
    else game.whiteRematch = true;
    await window.storage.set(currentGame.id, JSON.stringify(game), true);
  };

  /* ===================== RENDER ===================== */

  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Swords size={48} className="text-red-500" />
              <h1 className="text-6xl font-bold text-red-500">To The Death</h1>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2"><Users size={24} />Available Games</h2>
              <button onClick={loadGames} className="p-2 bg-gray-700 hover:bg-gray-600 rounded"><RefreshCw size={20} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {games.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No games. Create one!</p>
              ) : (
                games.map(g => (
                  <div key={g.id} className="bg-gray-700 p-4 rounded flex justify-between items-center">
                    <span>Game {g.id.split(':')[1]}</span>
                    <button onClick={() => joinGame(g.id)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded">Join</button>
                  </div>
                ))
              )}
            </div>
            <button onClick={createGame} className="w-full py-3 bg-red-600 hover:bg-red-700 rounded font-bold flex items-center justify-center gap-2">
              <Plus size={20} />Create Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'gameover') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-8 text-red-500">{winner === playerColor ? 'VICTORY' : 'DEFEAT'}</h1>
          <p className="text-3xl mb-8">{winner === 'black' ? 'Black' : 'White'} Wins!</p>
          <div className="flex gap-4 justify-center">
            <button onClick={requestRematch} className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold">Rematch</button>
            <button onClick={goToLobby} className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-bold">Lobby</button>
          </div>
          <p className="text-gray-500 mt-4 text-sm">Waiting for opponent to choose...</p>
        </div>
      </div>
    );
  }

  if (!currentGame) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center"><p className="text-xl">Loading...</p></div>;

  const waiting = currentGame.status === 'waiting';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold text-red-500 mb-2">To The Death</h1>
          <div className="flex justify-center gap-8 text-lg" style={{gap: '2rem'}}>
            <div className={playerColor === 'black' ? 'font-bold' : ''}>Black: ❤️ {currentGame.blackLives}</div>
            <div className={playerColor === 'white' ? 'font-bold' : ''}>White: ❤️ {currentGame.whiteLives}</div>
          </div>
        </div>

      {waiting ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-2xl">Waiting for opponent...</p>

          <div className="inline-block bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm text-gray-300">
            <span className="font-semibold text-gray-400">Game ID:</span>{' '}
            <span className="font-mono text-white">
              {currentGame.id.replace('game:', '')}
            </span>
          </div>
        </div>
      ) : (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-4">
              <GameBoard gameState={currentGame} onMove={handleMove} onAttack={handleAttack} 
                         phase={phase} playerColor={playerColor} pendingMove={pendingMove} 
                         pendingAttack={pendingAttack} animation={animation} />
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-center mb-4">
                <p className="text-xl">
                  {resolutionMessage || (
                    phase === 'move' ? 'Select tile to move' :
                    phase === 'attack' ? 'Select tile to attack' :
                    phase === 'waiting' ? 'Waiting for opponent...' :
                    phase === 'animating' ? 'Resolving turn...' : ''
                  )}
                </p>
              </div>
              <div className="flex" style={{gap: '1.2rem'}}>
                <button onClick={undoTurn} disabled={phase === 'waiting' || phase === 'animating'} 
                        className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-900 disabled:text-gray-600 rounded font-bold">Undo</button>
                <button onClick={confirmTurn} disabled={!pendingMove || !pendingAttack || phase !== 'attack'} 
                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-900 disabled:text-gray-600 rounded font-bold">Confirm</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}