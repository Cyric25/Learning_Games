/* maze.js – Seeded RNG + Labyrinth-Generator v2 */

// ── Seeded PRNG (Mulberry32) ─────────────────────────────────────
class SeededRNG {
  constructor(seed) { this.state = seed | 0; }

  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pick(arr) { return arr[this.nextInt(0, arr.length - 1)]; }
}

// ── Direction helpers ────────────────────────────────────────────
const DIR = {
  N: { dx: 0, dy: -1, wall: 1, opposite: 4 },
  E: { dx: 1, dy: 0,  wall: 2, opposite: 8 },
  S: { dx: 0, dy: 1,  wall: 4, opposite: 1 },
  W: { dx: -1, dy: 0, wall: 8, opposite: 2 }
};
const DIRS = [DIR.N, DIR.E, DIR.S, DIR.W];

function getTeamStartPositions(w, h) {
  const mx = w - 1, my = h - 1, cx = Math.floor((w - 1) / 2), cy = Math.floor((h - 1) / 2);
  return [
    { x: 0,  y: 0  },
    { x: mx, y: my },
    { x: mx, y: 0  },
    { x: 0,  y: my },
    { x: cx, y: 0  },
    { x: cx, y: my },
  ];
}

// ── MazeGenerator ────────────────────────────────────────────────
class MazeGenerator {
  constructor(width, height, seed) {
    this.w = width;
    this.h = height;
    this.rng = new SeededRNG(seed);
  }

  generate(config = {}) {
    const { doorCount = 14, teamCount = 4 } = config;
    const w = this.w, h = this.h;

    // Build grid: all walls initially (N=1, E=2, S=4, W=8)
    const grid = [];
    for (let y = 0; y < h; y++) {
      grid[y] = [];
      for (let x = 0; x < w; x++) {
        grid[y][x] = { walls: 15, type: 'path', visited: false };
      }
    }

    // 1. Recursive Backtracker
    this._recursiveBacktracker(grid, 0, 0);

    // 2. Extra connections (loops)
    this._addExtraConnections(grid, 18 + this.rng.nextInt(0, 6));

    // 3. Mark start positions
    const startPositions = getTeamStartPositions(w, h).slice(0, Math.min(teamCount, 6));
    startPositions.forEach(pos => { grid[pos.y][pos.x].type = 'start'; });

    // 4. Place doors (excluding start vicinities)
    const doors = this._placeDoors(grid, doorCount, startPositions);

    // 5. Validate: all starts can reach each other
    if (!this._validateConnected(grid, startPositions)) {
      this._addExtraConnections(grid, 10);
    }

    // Clean up
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        delete grid[y][x].visited;

    return { grid, doors, startPositions };
  }

  _inBounds(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }

  _recursiveBacktracker(grid, sx, sy) {
    const stack = [{ x: sx, y: sy }];
    grid[sy][sx].visited = true;

    while (stack.length > 0) {
      const { x, y } = stack[stack.length - 1];
      const neighbors = [];

      for (const dir of DIRS) {
        const nx = x + dir.dx, ny = y + dir.dy;
        if (this._inBounds(nx, ny) && !grid[ny][nx].visited)
          neighbors.push({ nx, ny, dir });
      }

      if (neighbors.length === 0) { stack.pop(); continue; }

      const { nx, ny, dir } = this.rng.pick(neighbors);
      grid[y][x].walls &= ~dir.wall;
      grid[ny][nx].walls &= ~dir.opposite;
      grid[ny][nx].visited = true;
      stack.push({ x: nx, y: ny });
    }
  }

  _addExtraConnections(grid, count) {
    let added = 0, attempts = 0;
    while (added < count && attempts < count * 10) {
      attempts++;
      const x = this.rng.nextInt(0, this.w - 1);
      const y = this.rng.nextInt(0, this.h - 1);
      const dir = this.rng.pick(DIRS);
      const nx = x + dir.dx, ny = y + dir.dy;
      if (!this._inBounds(nx, ny)) continue;
      if (grid[y][x].walls & dir.wall) {
        grid[y][x].walls &= ~dir.wall;
        grid[ny][nx].walls &= ~dir.opposite;
        added++;
      }
    }
  }

  _getOpenNeighborCount(grid, x, y) {
    return DIRS.reduce((c, d) => c + (!(grid[y][x].walls & d.wall) ? 1 : 0), 0);
  }

  _placeDoors(grid, count, startPositions) {
    // Build exclusion zone: 3 cells around each start
    const excluded = new Set();
    startPositions.forEach(pos => {
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const nx = pos.x + dx, ny = pos.y + dy;
          if (this._inBounds(nx, ny)) excluded.add(`${nx},${ny}`);
        }
    });

    // Corner pairs: two adjacent open sides share a corner → anchor point
    const PAIRS = [
      { corner: 'NE', dirs: ['N', 'E'], walls: [1, 2] },
      { corner: 'SE', dirs: ['E', 'S'], walls: [2, 4] },
      { corner: 'SW', dirs: ['S', 'W'], walls: [4, 8] },
      { corner: 'NW', dirs: ['W', 'N'], walls: [8, 1] },
    ];

    const candidates = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (excluded.has(`${x},${y}`)) continue;
        const cell = grid[y][x];
        for (const pair of PAIRS) {
          if (!(cell.walls & pair.walls[0]) && !(cell.walls & pair.walls[1]))
            candidates.push({ x, y, pair });
        }
      }
    }

    this.rng.shuffle(candidates);

    const doors = [];
    const usedPassages = new Set();

    for (const c of candidates) {
      if (doors.length >= count) break;

      let tooClose = false;
      for (const d of doors) {
        if (Math.abs(d.cellX - c.x) + Math.abs(d.cellY - c.y) < 3) { tooClose = true; break; }
      }
      if (tooClose) continue;

      // Randomly pick which of the two open sides the door blocks
      const sideIdx = this.rng.nextInt(0, 1);
      const blockedDir = c.pair.dirs[sideIdx];

      const passKey = this._passageKey(c.x, c.y, blockedDir);
      if (usedPassages.has(passKey)) continue;
      usedPassages.add(passKey);

      const rotDir = this.rng.nextInt(0, 1) === 0 ? 1 : -1;

      doors.push({
        id: 'door-' + doors.length,
        cellX: c.x, cellY: c.y,
        corner: c.pair.corner,
        blockedDir,
        rotDir,
        angle: 0,
        open: false,
        openedBy: null
      });
    }
    return doors;
  }

  _passageKey(x, y, dir) {
    if (dir === 'S') return `N:${x},${y + 1}`;
    if (dir === 'W') return `E:${x - 1},${y}`;
    return `${dir}:${x},${y}`;
  }

  _validateConnected(grid, startPositions) {
    if (startPositions.length < 2) return true;
    const { x: sx, y: sy } = startPositions[0];
    const visited = new Set([`${sx},${sy}`]);
    const queue = [{ x: sx, y: sy }];

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      for (const dir of DIRS) {
        if (grid[y][x].walls & dir.wall) continue;
        const nx = x + dir.dx, ny = y + dir.dy;
        if (!this._inBounds(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (!visited.has(key)) { visited.add(key); queue.push({ x: nx, y: ny }); }
      }
    }

    return startPositions.every(p => visited.has(`${p.x},${p.y}`));
  }
}
