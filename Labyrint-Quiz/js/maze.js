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

// Start positions for up to 6 teams (corners + top/bottom center)
const TEAM_START_POSITIONS = [
  { x: 0,  y: 0  },   // Team 0: top-left
  { x: 15, y: 15 },   // Team 1: bottom-right
  { x: 15, y: 0  },   // Team 2: top-right
  { x: 0,  y: 15 },   // Team 3: bottom-left
  { x: 7,  y: 0  },   // Team 4: top-center
  { x: 7,  y: 15 },   // Team 5: bottom-center
];

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
    const startPositions = TEAM_START_POSITIONS.slice(0, Math.min(teamCount, 6));
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

    // Candidates: corridor cells (exactly 2 open neighbors)
    const candidates = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (excluded.has(`${x},${y}`)) continue;
        if (this._getOpenNeighborCount(grid, x, y) === 2)
          candidates.push({ x, y });
      }

    this.rng.shuffle(candidates);

    const doors = [];
    for (const c of candidates) {
      if (doors.length >= count) break;
      let tooClose = false;
      for (const d of doors) {
        if (Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 4) { tooClose = true; break; }
      }
      if (tooClose) continue;
      grid[c.y][c.x].type = 'door';
      doors.push({ id: 'door-' + doors.length, x: c.x, y: c.y, open: false, openedBy: null });
    }
    return doors;
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
