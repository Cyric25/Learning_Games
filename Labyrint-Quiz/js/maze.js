/* maze.js – Seeded RNG + Labyrinth-Generator */

// ── Seeded PRNG (Mulberry32) ─────────────────────────────────────
class SeededRNG {
  constructor(seed) {
    this.state = seed | 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

// ── Direction helpers ────────────────────────────────────────────
const DIR = {
  N: { dx: 0, dy: -1, wall: 1, opposite: 4 },
  E: { dx: 1, dy: 0, wall: 2, opposite: 8 },
  S: { dx: 0, dy: 1, wall: 4, opposite: 1 },
  W: { dx: -1, dy: 0, wall: 8, opposite: 2 }
};
const DIRS = [DIR.N, DIR.E, DIR.S, DIR.W];
const WALL_BITS = { N: 1, E: 2, S: 4, W: 8 };

// ── MazeGenerator ────────────────────────────────────────────────
class MazeGenerator {
  constructor(width, height, seed) {
    this.w = width;
    this.h = height;
    this.rng = new SeededRNG(seed);
  }

  generate(config = {}) {
    const { doorCount = 8, symbolCount = 12 } = config;
    const w = this.w;
    const h = this.h;

    // Each cell stores: walls bitmask (N=1, E=2, S=4, W=8), all walls initially
    const grid = [];
    for (let y = 0; y < h; y++) {
      grid[y] = [];
      for (let x = 0; x < w; x++) {
        grid[y][x] = {
          walls: 15, // 1+2+4+8 = all walls
          type: 'path',
          visited: false
        };
      }
    }

    // 1. Recursive Backtracker – generates perfect maze (all cells connected)
    this._recursiveBacktracker(grid, 0, 0);

    // 2. Add extra connections (15–20) for loops / multiple paths
    this._addExtraConnections(grid, 15 + this.rng.nextInt(0, 5));

    // 3. Mark start and goal
    grid[0][0].type = 'start';
    grid[h - 1][w - 1].type = 'goal';

    // 4. Place doors on chokepoints
    const doors = this._placeDoors(grid, doorCount);

    // 5. Place symbols
    const symbols = this._placeSymbols(grid, symbolCount, doors);

    // 6. Validate: BFS from start to goal (all doors treated as open)
    if (!this._validateReachable(grid)) {
      // Extremely unlikely with recursive backtracker, but safety net
      // Remove a random wall to fix connectivity
      this._addExtraConnections(grid, 5);
    }

    // Clean up visited flags
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        delete grid[y][x].visited;
      }
    }

    return { grid, doors, symbols, start: { x: 0, y: 0 }, goal: { x: w - 1, y: h - 1 } };
  }

  _inBounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  _recursiveBacktracker(grid, startX, startY) {
    // Iterative version to avoid stack overflow on large grids
    const stack = [{ x: startX, y: startY }];
    grid[startY][startX].visited = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const { x, y } = current;

      // Find unvisited neighbors
      const neighbors = [];
      for (const dir of DIRS) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (this._inBounds(nx, ny) && !grid[ny][nx].visited) {
          neighbors.push({ nx, ny, dir });
        }
      }

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      // Pick random unvisited neighbor
      const chosen = this.rng.pick(neighbors);
      const { nx, ny, dir } = chosen;

      // Remove walls between current and chosen
      grid[y][x].walls &= ~dir.wall;
      grid[ny][nx].walls &= ~dir.opposite;
      grid[ny][nx].visited = true;

      stack.push({ x: nx, y: ny });
    }
  }

  _addExtraConnections(grid, count) {
    let added = 0;
    let attempts = 0;
    const maxAttempts = count * 10;

    while (added < count && attempts < maxAttempts) {
      attempts++;
      const x = this.rng.nextInt(0, this.w - 1);
      const y = this.rng.nextInt(0, this.h - 1);
      const dir = this.rng.pick(DIRS);
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      if (!this._inBounds(nx, ny)) continue;

      // Only remove wall if it currently exists
      if (grid[y][x].walls & dir.wall) {
        grid[y][x].walls &= ~dir.wall;
        grid[ny][nx].walls &= ~dir.opposite;
        added++;
      }
    }
  }

  _getOpenNeighborCount(grid, x, y) {
    let count = 0;
    for (const dir of DIRS) {
      if (!(grid[y][x].walls & dir.wall)) count++;
    }
    return count;
  }

  _placeDoors(grid, count) {
    // Find chokepoint candidates: cells with exactly 2 open neighbors (corridors)
    // Exclude start, goal, and their immediate neighbors
    const candidates = [];
    const excluded = new Set();
    excluded.add('0,0');
    excluded.add(`${this.w - 1},${this.h - 1}`);
    // Exclude cells adjacent to start/goal
    for (const dir of DIRS) {
      if (this._inBounds(dir.dx, dir.dy)) excluded.add(`${dir.dx},${dir.dy}`);
      const gx = this.w - 1 + dir.dx;
      const gy = this.h - 1 + dir.dy;
      if (this._inBounds(gx, gy)) excluded.add(`${gx},${gy}`);
    }

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (excluded.has(`${x},${y}`)) continue;
        const openNeighbors = this._getOpenNeighborCount(grid, x, y);
        if (openNeighbors === 2) {
          candidates.push({ x, y });
        }
      }
    }

    this.rng.shuffle(candidates);

    // Place doors with minimum distance between them
    const doors = [];
    const doorSet = new Set();

    for (const candidate of candidates) {
      if (doors.length >= count) break;

      // Check minimum distance of 3 from other doors
      let tooClose = false;
      for (const door of doors) {
        const dist = Math.abs(door.x - candidate.x) + Math.abs(door.y - candidate.y);
        if (dist < 3) { tooClose = true; break; }
      }
      if (tooClose) continue;

      grid[candidate.y][candidate.x].type = 'door';
      doors.push({ id: 'door-' + doors.length, x: candidate.x, y: candidate.y, open: false, openedBy: null });
      doorSet.add(`${candidate.x},${candidate.y}`);
    }

    return doors;
  }

  _placeSymbols(grid, count, doors) {
    // Find good positions: dead ends first, then 3+ neighbor intersections
    const doorSet = new Set(doors.map(d => `${d.x},${d.y}`));
    const deadEnds = [];
    const intersections = [];
    const regularPaths = [];

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (grid[y][x].type !== 'path') continue;
        if (doorSet.has(`${x},${y}`)) continue;

        const openN = this._getOpenNeighborCount(grid, x, y);
        if (openN === 1) deadEnds.push({ x, y });
        else if (openN >= 3) intersections.push({ x, y });
        else regularPaths.push({ x, y });
      }
    }

    this.rng.shuffle(deadEnds);
    this.rng.shuffle(intersections);
    this.rng.shuffle(regularPaths);

    // Prioritize dead ends, then intersections, then regular paths
    const allCandidates = [...deadEnds, ...intersections, ...regularPaths];

    const symbols = [];
    const symbolSet = new Set();

    for (const pos of allCandidates) {
      if (symbols.length >= count) break;

      // Minimum distance of 2 from other symbols
      let tooClose = false;
      for (const sym of symbols) {
        const dist = Math.abs(sym.x - pos.x) + Math.abs(sym.y - pos.y);
        if (dist < 2) { tooClose = true; break; }
      }
      if (tooClose) continue;

      grid[pos.y][pos.x].type = 'symbol';
      symbols.push({
        id: 'sym-' + symbols.length,
        x: pos.x,
        y: pos.y,
        categoryId: null, // assigned later by game logic
        found: false,
        foundBy: null
      });
      symbolSet.add(`${pos.x},${pos.y}`);
    }

    return symbols;
  }

  _validateReachable(grid) {
    // BFS from start to goal, treating doors as passable
    const visited = new Set();
    const queue = [{ x: 0, y: 0 }];
    visited.add('0,0');

    while (queue.length > 0) {
      const { x, y } = queue.shift();

      if (x === this.w - 1 && y === this.h - 1) return true;

      for (const dir of DIRS) {
        if (grid[y][x].walls & dir.wall) continue; // wall blocks
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (!this._inBounds(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }

    return false;
  }
}
