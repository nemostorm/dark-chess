'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard, PieceDropHandlerArgs } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Switch } from './ui/switch';

export default function ChessGame() {
  const [game, setGame] = useState(new Chess());
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [difficulty, setDifficulty] = useState(10);
  const [assistance, setAssistance] = useState(false);
  const [gameHistory, setGameHistory] = useState<Chess[]>([new Chess()]);
  const [stockfishReady, setStockfishReady] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const stockfishRef = useRef<Worker | null>(null);

  const getSkillLevel = (depth: number) => {
    switch (depth) {
      case 5: return 2;  // Easy
      case 10: return 10; // Medium
      case 15: return 15; // Hard
      case 20: return 20; // Expert
      default: return 10;
    }
  };

  const updateGame = (newGame: Chess) => {
    setGame(newGame);
    setGameHistory(prev => [...prev, new Chess(newGame.fen())]);
    setSelectedSquare(null);
  };

  const undoMove = () => {
    if (gameHistory.length > 1) {
      const newHistory = [...gameHistory];
      newHistory.pop(); // remove current state
      const previousGame = newHistory[newHistory.length - 1];
      setGame(new Chess(previousGame.fen()));
      setGameHistory(newHistory);
      setSelectedSquare(null);
    }
  };

  const updateDifficulty = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    if (stockfishRef.current && stockfishReady) {
      const skillLevel = getSkillLevel(newDifficulty);
      stockfishRef.current.postMessage(`setoption name Skill Level value ${skillLevel}`);
    }
  };

  const onStockfishMessage = useCallback((event: MessageEvent) => {
    const message = event.data as string;
    console.log('Stockfish:', message);

    if (message.includes('uciok')) {
      console.log('Stockfish UCI ready');
      stockfishRef.current?.postMessage('isready');
    } else if (message.includes('readyok')) {
      console.log('Stockfish ready');
      setStockfishReady(true);
      // Set initial skill level
      const initialSkill = getSkillLevel(difficulty);
      stockfishRef.current?.postMessage(`setoption name Skill Level value ${initialSkill}`);
    } else if (message.includes('bestmove')) {
      const bestMove = message.split(' ')[1];
      const gameCopy = new Chess(game.fen());
      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined;
      const result = gameCopy.move({ from, to, promotion });
      if (result) {
        updateGame(gameCopy);
      }
    }
  }, [game, difficulty]);

  useEffect(() => {
    // Initialize Stockfish Worker
    try {
      stockfishRef.current = new Worker('/stockfish/stockfish-17.1-lite-single-03e3232.js');
      stockfishRef.current.addEventListener('message', onStockfishMessage);
      stockfishRef.current.addEventListener('error', (error) => {
        console.error('Stockfish worker error:', error);
      });

      // Set up Stockfish
      stockfishRef.current.postMessage('uci');
    } catch (error) {
      console.error('Failed to create Stockfish worker:', error);
    }

    return () => {
      if (stockfishRef.current) {
        stockfishRef.current.removeEventListener('message', onStockfishMessage);
        stockfishRef.current.terminate();
      }
    };
  }, [onStockfishMessage]);

  const onDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
    if (!targetSquare || sourceSquare === targetSquare) return false;

    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // always promote to queen for simplicity
    });

    if (move === null) return false; // illegal move

    updateGame(gameCopy);

    // If it's not checkmate or stalemate, let Stockfish make a move
    if (!gameCopy.isGameOver() && stockfishReady) {
      // Send position to Stockfish
      stockfishRef.current?.postMessage(`position fen ${gameCopy.fen()}`);
      stockfishRef.current?.postMessage('go depth 15'); // fixed depth, skill level controls strength
    }

    return true;
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (assistance) {
      setSelectedSquare(square as Square);
    }
  };

  const getCustomSquareStyles = () => {
    if (!assistance || !selectedSquare) return {};

    const moves = game.moves({ square: selectedSquare, verbose: true });
    const styles: { [square: string]: React.CSSProperties } = {};

    moves.forEach(move => {
      styles[move.to] = {
        backgroundColor: 'rgba(0, 255, 0, 0.3)',
        border: '2px solid green',
      };
    });

    return styles;
  };

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setGameHistory([new Chess()]);
    setSelectedSquare(null);
  };

  const flipBoard = () => {
    setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white');
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 text-white">
      <div className="w-full max-w-2xl">
        <Chessboard
          options={{
            position: game.fen(),
            onPieceDrop: onDrop,
            onSquareClick: onSquareClick,
            boardOrientation: boardOrientation,
            lightSquareStyle: { backgroundColor: '#222' },
            darkSquareStyle: { backgroundColor: '#111' },
            squareStyles: getCustomSquareStyles(),
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={resetGame}
          className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
        >
          New Game
        </button>
        <button
          onClick={undoMove}
          disabled={gameHistory.length <= 1}
          className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Undo Move
        </button>
        <button
          onClick={flipBoard}
          className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
        >
          Flip Board
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200">
              Difficulty: {difficulty === 5 ? 'Easy' : difficulty === 10 ? 'Medium' : difficulty === 15 ? 'Hard' : 'Expert'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => updateDifficulty(5)}>Easy</DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateDifficulty(10)}>Medium</DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateDifficulty(15)}>Hard</DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateDifficulty(20)}>Expert</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="assistance" className="text-white">Show Legal Moves</label>
        <Switch
          id="assistance"
          checked={assistance}
          onCheckedChange={setAssistance}
        />
      </div>
      <div className="text-center">
        <p>Turn: {game.turn() === 'w' ? 'White' : 'Black'}</p>
        {game.isCheckmate() && <p>Checkmate! {game.turn() === 'w' ? 'Black' : 'White'} wins!</p>}
        {game.isStalemate() && <p>Stalemate! It&apos;s a draw.</p>}
        {game.isDraw() && !game.isStalemate() && <p>Draw!</p>}
      </div>
    </div>
  );
}