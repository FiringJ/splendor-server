import { Card, Noble } from '../interfaces/game.interface';

export const LEVEL1_CARDS: Card[] = [
  // 黑色卡牌 (8张)
  {
    id: 101,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { diamond: 1, sapphire: 1, emerald: 1, ruby: 1 },
    spritePosition: { x: 0, y: 1 }
  },
  {
    id: 102,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { diamond: 1, sapphire: 2, emerald: 1, ruby: 1 },
    spritePosition: { x: 1, y: 1 }
  },
  {
    id: 103,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { diamond: 2, sapphire: 2, ruby: 1 },
    spritePosition: { x: 2, y: 1 }
  },
  {
    id: 104,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { emerald: 1, ruby: 3, onyx: 1 },
    spritePosition: { x: 3, y: 1 }
  },
  {
    id: 105,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { emerald: 2, ruby: 1 },
    spritePosition: { x: 4, y: 1 }
  },
  {
    id: 106,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { diamond: 2, emerald: 2 },
    spritePosition: { x: 0, y: 1 }
  },
  {
    id: 107,
    level: 1,
    points: 0,
    gem: 'onyx',
    cost: { emerald: 3 },
    spritePosition: { x: 1, y: 1 }
  },
  {
    id: 108,
    level: 1,
    points: 1,
    gem: 'onyx',
    cost: { sapphire: 4 },
    spritePosition: { x: 2, y: 1 }
  },

  // 蓝宝石卡牌 (8张)
  {
    id: 109,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { diamond: 1, emerald: 1, ruby: 1, onyx: 1 },
    spritePosition: { x: 0, y: 0 }
  },
  {
    id: 110,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { diamond: 1, emerald: 1, ruby: 2, onyx: 1 },
    spritePosition: { x: 1, y: 0 }
  },
  {
    id: 111,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { diamond: 1, emerald: 2, ruby: 2 },
    spritePosition: { x: 2, y: 0 }
  },
  {
    id: 112,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { sapphire: 1, emerald: 3, ruby: 1 },
    spritePosition: { x: 3, y: 0 }
  },
  {
    id: 113,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { diamond: 1, onyx: 2 },
    spritePosition: { x: 4, y: 0 }
  },
  {
    id: 114,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { emerald: 2, onyx: 2 },
    spritePosition: { x: 0, y: 0 }
  },
  {
    id: 115,
    level: 1,
    points: 1,
    gem: 'sapphire',
    cost: { ruby: 4 },
    spritePosition: { x: 1, y: 0 }
  },
  {
    id: 116,
    level: 1,
    points: 0,
    gem: 'sapphire',
    cost: { sapphire: 3 },
    spritePosition: { x: 2, y: 0 }
  },

  // 白宝石卡牌 (8张)
  {
    id: 117,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { sapphire: 1, emerald: 1, ruby: 1, onyx: 1 },
    spritePosition: { x: 0, y: 4 }
  },
  {
    id: 118,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { sapphire: 1, emerald: 2, ruby: 1, onyx: 1 },
    spritePosition: { x: 1, y: 4 }
  },
  {
    id: 119,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { sapphire: 2, emerald: 2, onyx: 1 },
    spritePosition: { x: 2, y: 4 }
  },
  {
    id: 120,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { diamond: 3, sapphire: 1, onyx: 1 },
    spritePosition: { x: 3, y: 4 }
  },
  {
    id: 121,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { ruby: 2, onyx: 1 },
    spritePosition: { x: 4, y: 4 }
  },
  {
    id: 122,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { sapphire: 2, onyx: 2 },
    spritePosition: { x: 0, y: 4 }
  },
  {
    id: 123,
    level: 1,
    points: 1,
    gem: 'diamond',
    cost: { emerald: 4 },
    spritePosition: { x: 1, y: 4 }
  },
  {
    id: 124,
    level: 1,
    points: 0,
    gem: 'diamond',
    cost: { diamond: 3 },
    spritePosition: { x: 2, y: 4 }
  },

  // 绿宝石卡牌 (8张)
  {
    id: 125,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { diamond: 1, sapphire: 1, ruby: 1, onyx: 1 },
    spritePosition: { x: 0, y: 3 }
  },
  {
    id: 126,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { diamond: 1, sapphire: 1, ruby: 1, onyx: 2 },
    spritePosition: { x: 1, y: 3 }
  },
  {
    id: 127,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { sapphire: 1, ruby: 2, onyx: 2 },
    spritePosition: { x: 2, y: 3 }
  },
  {
    id: 128,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { diamond: 1, sapphire: 3, emerald: 1 },
    spritePosition: { x: 3, y: 3 }
  },
  {
    id: 129,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { diamond: 2, sapphire: 1 },
    spritePosition: { x: 4, y: 3 }
  },
  {
    id: 130,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { sapphire: 2, ruby: 2 },
    spritePosition: { x: 0, y: 3 }
  },
  {
    id: 131,
    level: 1,
    points: 1,
    gem: 'emerald',
    cost: { onyx: 4 },
    spritePosition: { x: 1, y: 3 }
  },
  {
    id: 132,
    level: 1,
    points: 0,
    gem: 'emerald',
    cost: { ruby: 3 },
    spritePosition: { x: 2, y: 3 }
  },

  // 红宝石卡牌 (8张)
  {
    id: 133,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 1, sapphire: 1, emerald: 1, onyx: 1 },
    spritePosition: { x: 0, y: 2 }
  },
  {
    id: 134,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 2, sapphire: 1, emerald: 1, onyx: 1 },
    spritePosition: { x: 1, y: 2 }
  },
  {
    id: 135,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 2, emerald: 1, onyx: 2 },
    spritePosition: { x: 2, y: 2 }
  },
  {
    id: 136,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 1, ruby: 1, onyx: 3 },
    spritePosition: { x: 3, y: 2 }
  },
  {
    id: 137,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { sapphire: 2, emerald: 1 },
    spritePosition: { x: 4, y: 2 }
  },
  {
    id: 138,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 2, ruby: 2 },
    spritePosition: { x: 0, y: 2 }
  },
  {
    id: 139,
    level: 1,
    points: 0,
    gem: 'ruby',
    cost: { diamond: 3 },
    spritePosition: { x: 1, y: 2 }
  },
  {
    id: 140,
    level: 1,
    points: 1,
    gem: 'ruby',
    cost: { diamond: 4 },
    spritePosition: { x: 2, y: 2 }
  }
];

export const LEVEL2_CARDS: Card[] = [
  // 黑色卡牌 (6张)
  {
    id: 201,
    level: 2,
    points: 1,
    gem: 'onyx',
    cost: { diamond: 3, sapphire: 2, emerald: 2 },  // 3w+2u+2g
    spritePosition: { x: 0, y: 1 }
  },
  {
    id: 202,
    level: 2,
    points: 1,
    gem: 'onyx',
    cost: { diamond: 3, emerald: 3, onyx: 2 },  // 3w+3g+2k
    spritePosition: { x: 1, y: 1 }
  },
  {
    id: 203,
    level: 2,
    points: 2,
    gem: 'onyx',
    cost: { sapphire: 1, emerald: 4, ruby: 2 },  // 1u+4g+2r
    spritePosition: { x: 2, y: 1 }
  },
  {
    id: 204,
    level: 2,
    points: 2,
    gem: 'onyx',
    cost: { emerald: 5, ruby: 3 },  // 5g+3r
    spritePosition: { x: 3, y: 1 }
  },
  {
    id: 205,
    level: 2,
    points: 2,
    gem: 'onyx',
    cost: { diamond: 5 },  // 5w
    spritePosition: { x: 4, y: 1 }
  },
  {
    id: 206,
    level: 2,
    points: 3,
    gem: 'onyx',
    cost: { onyx: 6 },  // 6k
    spritePosition: { x: 0, y: 1 }
  },

  // 蓝宝石卡牌 (6张)
  {
    id: 207,
    level: 2,
    points: 1,
    gem: 'sapphire',
    cost: { sapphire: 2, emerald: 2, ruby: 3 },  // 2u+2g+3r
    spritePosition: { x: 0, y: 0 }
  },
  {
    id: 208,
    level: 2,
    points: 1,
    gem: 'sapphire',
    cost: { sapphire: 2, emerald: 3, onyx: 3 },  // 2u+3g+3k
    spritePosition: { x: 1, y: 0 }
  },
  {
    id: 209,
    level: 2,
    points: 2,
    gem: 'sapphire',
    cost: { diamond: 5, sapphire: 3 },  // 5w+3u
    spritePosition: { x: 2, y: 0 }
  },
  {
    id: 210,
    level: 2,
    points: 2,
    gem: 'sapphire',
    cost: { diamond: 2, ruby: 1, onyx: 4 },  // 2w+1r+4k
    spritePosition: { x: 3, y: 0 }
  },
  {
    id: 211,
    level: 2,
    points: 2,
    gem: 'sapphire',
    cost: { sapphire: 5 },  // 5u
    spritePosition: { x: 4, y: 0 }
  },
  {
    id: 212,
    level: 2,
    points: 3,
    gem: 'sapphire',
    cost: { sapphire: 6 },  // 6u
    spritePosition: { x: 0, y: 0 }
  },

  // 白宝石卡牌 (6张)
  {
    id: 213,
    level: 2,
    points: 1,
    gem: 'diamond',
    cost: { emerald: 3, ruby: 2, onyx: 2 },  // 3g+2r+2k
    spritePosition: { x: 0, y: 4 }
  },
  {
    id: 214,
    level: 2,
    points: 1,
    gem: 'diamond',
    cost: { diamond: 2, sapphire: 3, ruby: 3 },  // 2w+3u+3r
    spritePosition: { x: 1, y: 4 }
  },
  {
    id: 215,
    level: 2,
    points: 2,
    gem: 'diamond',
    cost: { emerald: 1, ruby: 4, onyx: 2 },  // 1g+4r+2k
    spritePosition: { x: 2, y: 4 }
  },
  {
    id: 216,
    level: 2,
    points: 2,
    gem: 'diamond',
    cost: { ruby: 5, onyx: 3 },  // 5r+3k
    spritePosition: { x: 3, y: 4 }
  },
  {
    id: 217,
    level: 2,
    points: 2,
    gem: 'diamond',
    cost: { ruby: 5 },  // 5r
    spritePosition: { x: 4, y: 4 }
  },
  {
    id: 218,
    level: 2,
    points: 3,
    gem: 'diamond',
    cost: { diamond: 6 },  // 6w
    spritePosition: { x: 0, y: 4 }
  },

  // 绿宝石卡牌 (6张)
  {
    id: 219,
    level: 2,
    points: 1,
    gem: 'emerald',
    cost: { diamond: 3, emerald: 2, ruby: 3 },  // 3w+2g+3r
    spritePosition: { x: 0, y: 3 }
  },
  {
    id: 220,
    level: 2,
    points: 1,
    gem: 'emerald',
    cost: { diamond: 2, sapphire: 3, onyx: 2 },  // 2w+3u+2k
    spritePosition: { x: 1, y: 3 }
  },
  {
    id: 221,
    level: 2,
    points: 2,
    gem: 'emerald',
    cost: { diamond: 4, sapphire: 2, onyx: 1 },  // 4w+2u+1k
    spritePosition: { x: 2, y: 3 }
  },
  {
    id: 222,
    level: 2,
    points: 2,
    gem: 'emerald',
    cost: { sapphire: 5, emerald: 3 },  // 5u+3g
    spritePosition: { x: 3, y: 3 }
  },
  {
    id: 223,
    level: 2,
    points: 2,
    gem: 'emerald',
    cost: { emerald: 5 },  // 5g
    spritePosition: { x: 4, y: 3 }
  },
  {
    id: 224,
    level: 2,
    points: 3,
    gem: 'emerald',
    cost: { emerald: 6 },  // 6g
    spritePosition: { x: 0, y: 3 }
  },

  // 红宝石卡牌 (6张)
  {
    id: 225,
    level: 2,
    points: 1,
    gem: 'ruby',
    cost: { diamond: 2, ruby: 2, onyx: 3 },  // 2w+2r+3k
    spritePosition: { x: 0, y: 2 }
  },
  {
    id: 226,
    level: 2,
    points: 1,
    gem: 'ruby',
    cost: { sapphire: 3, ruby: 2, onyx: 3 },  // 3u+2r+3k
    spritePosition: { x: 1, y: 2 }
  },
  {
    id: 227,
    level: 2,
    points: 2,
    gem: 'ruby',
    cost: { diamond: 1, sapphire: 4, emerald: 2 },  // 1w+4u+2g
    spritePosition: { x: 2, y: 2 }
  },
  {
    id: 228,
    level: 2,
    points: 2,
    gem: 'ruby',
    cost: { diamond: 3, onyx: 5 },  // 3w+5k
    spritePosition: { x: 3, y: 2 }
  },
  {
    id: 229,
    level: 2,
    points: 2,
    gem: 'ruby',
    cost: { onyx: 5 },  // 5k
    spritePosition: { x: 4, y: 2 }
  },
  {
    id: 230,
    level: 2,
    points: 3,
    gem: 'ruby',
    cost: { ruby: 6 },  // 6r
    spritePosition: { x: 0, y: 2 }
  }
];

export const LEVEL3_CARDS: Card[] = [
  // 黑色卡牌 (4张)
  {
    id: 301,
    level: 3,
    points: 3,
    gem: 'onyx',
    cost: { diamond: 3, sapphire: 3, emerald: 5, ruby: 3 },  // 3w+3u+5g+3r
    spritePosition: { x: 0, y: 1 }
  },
  {
    id: 302,
    level: 3,
    points: 4,
    gem: 'onyx',
    cost: { ruby: 7 },  // 7r
    spritePosition: { x: 1, y: 1 }
  },
  {
    id: 303,
    level: 3,
    points: 4,
    gem: 'onyx',
    cost: { emerald: 3, ruby: 6, onyx: 3 },  // 3g+6r+3k
    spritePosition: { x: 2, y: 1 }
  },
  {
    id: 304,
    level: 3,
    points: 5,
    gem: 'onyx',
    cost: { ruby: 7, onyx: 3 },  // 7r+3k
    spritePosition: { x: 3, y: 1 }
  },

  // 蓝宝石卡牌 (4张)
  {
    id: 305,
    level: 3,
    points: 3,
    gem: 'sapphire',
    cost: { diamond: 3, emerald: 3, ruby: 3, onyx: 5 },  // 3w+3g+3r+5k
    spritePosition: { x: 0, y: 0 }
  },
  {
    id: 306,
    level: 3,
    points: 4,
    gem: 'sapphire',
    cost: { diamond: 7 },  // 7w
    spritePosition: { x: 1, y: 0 }
  },
  {
    id: 307,
    level: 3,
    points: 4,
    gem: 'sapphire',
    cost: { diamond: 6, sapphire: 3, onyx: 3 },  // 6w+3u+3k
    spritePosition: { x: 2, y: 0 }
  },
  {
    id: 308,
    level: 3,
    points: 5,
    gem: 'sapphire',
    cost: { diamond: 7, sapphire: 3 },  // 7w+3u
    spritePosition: { x: 3, y: 0 }
  },

  // 白宝石卡牌 (4张)
  {
    id: 309,
    level: 3,
    points: 3,
    gem: 'diamond',
    cost: { sapphire: 3, emerald: 3, ruby: 5, onyx: 3 },  // 3u+3g+5r+3k
    spritePosition: { x: 0, y: 4 }
  },
  {
    id: 310,
    level: 3,
    points: 4,
    gem: 'diamond',
    cost: { onyx: 7 },  // 7k
    spritePosition: { x: 1, y: 4 }
  },
  {
    id: 311,
    level: 3,
    points: 4,
    gem: 'diamond',
    cost: { diamond: 3, ruby: 3, onyx: 6 },  // 3w+3r+6k
    spritePosition: { x: 2, y: 4 }
  },
  {
    id: 312,
    level: 3,
    points: 5,
    gem: 'diamond',
    cost: { diamond: 3, onyx: 7 },  // 3w+7k
    spritePosition: { x: 3, y: 4 }
  },

  // 绿宝石卡牌 (4张)
  {
    id: 313,
    level: 3,
    points: 3,
    gem: 'emerald',
    cost: { diamond: 5, sapphire: 3, ruby: 3, onyx: 3 },  // 5w+3u+3r+3k
    spritePosition: { x: 0, y: 3 }
  },
  {
    id: 314,
    level: 3,
    points: 4,
    gem: 'emerald',
    cost: { sapphire: 7 },  // 7u
    spritePosition: { x: 1, y: 3 }
  },
  {
    id: 315,
    level: 3,
    points: 4,
    gem: 'emerald',
    cost: { diamond: 3, sapphire: 6, emerald: 3 },  // 3w+6u+3g
    spritePosition: { x: 2, y: 3 }
  },
  {
    id: 316,
    level: 3,
    points: 5,
    gem: 'emerald',
    cost: { sapphire: 7, emerald: 3 },  // 7u+3g
    spritePosition: { x: 3, y: 3 }
  },

  // 红宝石卡牌 (4张)
  {
    id: 317,
    level: 3,
    points: 3,
    gem: 'ruby',
    cost: { diamond: 3, sapphire: 5, emerald: 3, onyx: 3 },  // 3w+5u+3g+3k
    spritePosition: { x: 0, y: 2 }
  },
  {
    id: 318,
    level: 3,
    points: 4,
    gem: 'ruby',
    cost: { emerald: 7 },  // 7g
    spritePosition: { x: 1, y: 2 }
  },
  {
    id: 319,
    level: 3,
    points: 4,
    gem: 'ruby',
    cost: { sapphire: 3, emerald: 6, ruby: 3 },  // 3u+6g+3r
    spritePosition: { x: 2, y: 2 }
  },
  {
    id: 320,
    level: 3,
    points: 5,
    gem: 'ruby',
    cost: { emerald: 7, ruby: 3 },  // 7g+3r
    spritePosition: { x: 3, y: 2 }
  }
];

export const NOBLES: Noble[] = [
  // A1 - Mary Stuart
  {
    id: 1,
    points: 3,
    name: 'Mary Stuart',
    requirements: {
      ruby: 4,
      emerald: 4
    }
  },
  // A2 - Charles Quint (Karl V)
  {
    id: 2,
    points: 3,
    name: 'Charles Quint',
    requirements: {
      onyx: 3,
      ruby: 3,
      diamond: 3
    }
  },
  // A3 - Macchiavelli
  {
    id: 3,
    points: 3,
    name: 'Macchiavelli',
    requirements: {
      sapphire: 4,
      diamond: 4
    }
  },
  // B1 - Isabel of Castille
  {
    id: 4,
    points: 3,
    name: 'Isabel of Castille',
    requirements: {
      onyx: 4,
      diamond: 4
    }
  },
  // B2 - Soliman the Magnificent
  {
    id: 5,
    points: 3,
    name: 'Soliman the Magnificent',
    requirements: {
      sapphire: 4,
      emerald: 4
    }
  },
  // B3 - Catherine of Medicis
  {
    id: 6,
    points: 3,
    name: 'Catherine of Medicis',
    requirements: {
      emerald: 3,
      sapphire: 3,
      ruby: 3
    }
  },
  // C1 - Anne of Brittany
  {
    id: 7,
    points: 3,
    name: 'Anne of Brittany',
    requirements: {
      emerald: 3,
      sapphire: 3,
      diamond: 3
    }
  },
  // C2 - Henri VIII
  {
    id: 8,
    points: 3,
    name: 'Henri VIII',
    requirements: {
      onyx: 4,
      ruby: 4
    }
  },
  // D1 - Elisabeth of Austria
  {
    id: 9,
    points: 3,
    name: 'Elisabeth of Austria',
    requirements: {
      onyx: 3,
      sapphire: 3,
      diamond: 3
    }
  },
  // D2 - Francis I of France
  {
    id: 10,
    points: 3,
    name: 'Francis I of France',
    requirements: {
      onyx: 3,
      ruby: 3,
      emerald: 3
    }
  }
]; 