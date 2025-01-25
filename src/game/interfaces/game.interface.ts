export interface Player {
  id: string;
  name: string;
  gems: Gems;
  cards: Card[];
  reservedCards: Card[];
  nobles: Noble[];
  points: number;
}

export interface Gems {
  diamond?: number;
  sapphire?: number;
  emerald?: number;
  ruby?: number;
  onyx?: number;
  gold?: number;
}

export interface Card {
  id: number;
  level: 1 | 2 | 3;
  points: number;
  gem: keyof Gems;
  cost: Partial<Record<keyof Gems, number>>;
  image?: string;
  spritePosition: {
    x: number;  // 精灵图中的x坐标（第几列，从0开始）
    y: number;  // 精灵图中的y坐标（第几行，从0开始）
  };
}

export interface Noble {
  id: number;
  points: number;
  name: string;
  requirements: Partial<Record<keyof Gems, number>>;
  image?: string;
}

export interface GameState {
  players: Map<string, Player>;
  currentTurn: string;
  gems: Gems;
  cards: {
    level1: Card[];
    level2: Card[];
    level3: Card[];
  };
  nobles: Noble[];
  winner?: string;
  lastRound: boolean;
  lastRoundStartPlayer: string | null;
  actions: GameAction[];
}

export interface GameRoom {
  id: string;
  players: Player[];
  gameState: GameState;
  status: 'waiting' | 'playing' | 'finished';
}

export interface RoomState {
  id: string;
  players: Player[];
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
}

export type GameAction =
  | { type: 'TAKE_GEMS'; gems: Partial<Gems>; playerId: string }
  | { type: 'BUY_CARD'; cardId: string; playerId: string }
  | { type: 'RESERVE_CARD'; cardId: string; playerId: string }
  | { type: 'START_GAME'; } 