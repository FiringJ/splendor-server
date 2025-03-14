export type GemType = keyof Gems;

export interface Player {
  id: string;
  clientId?: string;  // Socket.IO的客户端ID
  name: string;
  gems: Gems;
  cards: Card[];
  reservedCards: Card[];
  nobles: Noble[];
  points: number;
  isAI?: boolean; // 是否是AI
}

export interface Gems {
  diamond: number;
  sapphire: number;
  emerald: number;
  ruby: number;
  onyx: number;
  gold: number;
}

export interface Card {
  id: number;
  level: 1 | 2 | 3;
  points: number;
  gem: GemType;
  cost: Partial<Record<GemType, number>>;
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
  requirements: Partial<Record<GemType, number>>;
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
    deck1: Card[];
    deck2: Card[];
    deck3: Card[];
  };
  nobles: Noble[];
  winner: string | null;
  lastRound: boolean;
  lastRoundStartPlayer: string | null;
  actions: GameAction[];
}

export interface GameRoom {
  id: string;
  players: Player[];
  gameState: GameState | null;
  status: 'waiting' | 'playing' | 'finished';
}

export interface RoomState {
  id: string;
  players: Player[];
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  gameState: GameState | null;
  isLocalMode?: boolean;
}

export type GameActionType =
  | 'TAKE_GEMS'
  | 'PURCHASE_CARD'
  | 'RESERVE_CARD'
  | 'CLAIM_NOBLE'
  | 'DISCARD_GEMS';

export interface TakeGemsAction {
  type: 'TAKE_GEMS';
  playerId?: string; // 可选，如果不存在则使用当前回合的玩家
  payload: {
    gems: Partial<Record<GemType, number>>;
  };
}

export interface PurchaseCardAction {
  type: 'PURCHASE_CARD';
  playerId?: string;
  payload: {
    cardId: number;
  };
}

export interface ReserveCardAction {
  type: 'RESERVE_CARD';
  playerId?: string;
  payload: {
    cardId: number;
    level?: number; // 当从牌堆预留时，需要指定牌堆等级
  };
}

export interface DiscardGemsAction {
  type: 'DISCARD_GEMS';
  playerId?: string;
  payload: {
    gems: Partial<Record<GemType, number>>;
  };
}

export interface StartGameAction {
  type: 'START_GAME';
}

export type GameAction =
  | TakeGemsAction
  | PurchaseCardAction
  | ReserveCardAction
  | DiscardGemsAction
  | StartGameAction; 