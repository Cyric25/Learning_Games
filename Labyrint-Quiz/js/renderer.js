/* renderer.js – Canvas-Renderer für das Labyrinth */

class MazeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maze = null;
    this.gameState = null;
    this.cellSize = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this._animationId = null;
    this._pendingAnimations = [];

    // Team figure emojis
    this.FIGURES = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];

    // Cache colors
    this._colors = null;
    this._colorsTheme = null;
  }

  // ── Color helpers ──────────────────────────────────────────────
  _readColors() {
    const currentTheme = document.body.classList.contains('dark') ? 'dark' : 'light';
    if (this._colors && this._colorsTheme === currentTheme) return this._colors;

    const s = getComputedStyle(document.body);
    const get = (prop, fallback) => s.getPropertyValue(prop).trim() || fallback;

    this._colors = {
      wall:       get('--maze-wall', '#2d1b69'),
      path:       get('--maze-path', '#f3f0ff'),
      door:       get('--maze-door', '#dc2626'),
      doorOpen:   get('--maze-door-open', '#16a34a'),
      symbol:     get('--maze-symbol', '#eab308'),
      symbolFound: get('--maze-symbol-found', '#9ca3af'),
      goal:       get('--maze-goal', '#f59e0b'),
      start:      get('--maze-start', '#3b82f6'),
      bg:         get('--bg-primary', '#fdf6f0'),
      text:       get('--text-primary', '#1a1a1a'),
      accent:     get('--accent', '#7c3aed'),
      teams: [
        get('--team-1', '#3b82f6'),
        get('--team-2', '#ef4444'),
        get('--team-3', '#22c55e'),
        get('--team-4', '#f59e0b'),
        get('--team-5', '#a855f7'),
        get('--team-6', '#ec4899')
      ]
    };
    this._colorsTheme = currentTheme;
    return this._colors;
  }

  // ── Sizing ─────────────────────────────────────────────────────
  resize() {
    const parent = this.canvas.parentElement;
    if (!parent || !this.maze) return;

    const available = Math.min(parent.clientWidth, parent.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const size = Math.floor(available);

    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const wallWidth = 2;
    this.cellSize = Math.floor((size - wallWidth) / this.maze.grid[0].length);
    this.offsetX = Math.floor((size - this.cellSize * this.maze.grid[0].length) / 2);
    this.offsetY = Math.floor((size - this.cellSize * this.maze.grid.length) / 2);
  }

  // ── Main render ────────────────────────────────────────────────
  setMaze(maze) {
    this.maze = maze;
    this.resize();
  }

  render(gameState) {
    this.gameState = gameState;
    const ctx = this.ctx;
    const c = this._readColors();
    const cs = this.cellSize;
    const ox = this.offsetX;
    const oy = this.offsetY;
    const grid = this.maze.grid;
    const h = grid.length;
    const w = grid[0].length;

    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw cells
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this._drawCell(ctx, x, y, c, cs, ox, oy);
      }
    }

    // Draw walls
    ctx.strokeStyle = c.wall;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this._drawWalls(ctx, grid[y][x], x, y, cs, ox, oy);
      }
    }

    // Draw outer border
    ctx.strokeStyle = c.wall;
    ctx.lineWidth = 3;
    ctx.strokeRect(ox, oy, w * cs, h * cs);

    // Draw door icons
    for (const door of gameState.doors) {
      this._drawDoor(ctx, door, c, cs, ox, oy);
    }

    // Draw symbols
    for (const sym of gameState.symbols) {
      this._drawSymbol(ctx, sym, gameState, c, cs, ox, oy);
    }

    // Draw start marker
    this._drawMarker(ctx, this.maze.start.x, this.maze.start.y, 'S', c.start, c, cs, ox, oy);

    // Draw goal marker
    this._drawMarker(ctx, this.maze.goal.x, this.maze.goal.y, '🏁', c.goal, c, cs, ox, oy);

    // Draw team figures
    this._drawTeams(ctx, gameState, c, cs, ox, oy);
  }

  // ── Cell background ────────────────────────────────────────────
  _drawCell(ctx, x, y, c, cs, ox, oy) {
    const cell = this.maze.grid[y][x];
    let color = c.path;

    if (cell.type === 'start') color = c.start + '33'; // 20% opacity
    else if (cell.type === 'goal') color = c.goal + '33';

    ctx.fillStyle = color;
    ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
  }

  // ── Walls ──────────────────────────────────────────────────────
  _drawWalls(ctx, cell, x, y, cs, ox, oy) {
    const px = ox + x * cs;
    const py = oy + y * cs;

    ctx.beginPath();
    if (cell.walls & 1) { // N
      ctx.moveTo(px, py);
      ctx.lineTo(px + cs, py);
    }
    if (cell.walls & 2) { // E
      ctx.moveTo(px + cs, py);
      ctx.lineTo(px + cs, py + cs);
    }
    if (cell.walls & 4) { // S
      ctx.moveTo(px, py + cs);
      ctx.lineTo(px + cs, py + cs);
    }
    if (cell.walls & 8) { // W
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + cs);
    }
    ctx.stroke();
  }

  // ── Door icon ──────────────────────────────────────────────────
  _drawDoor(ctx, door, c, cs, ox, oy) {
    const cx = ox + door.x * cs + cs / 2;
    const cy = oy + door.y * cs + cs / 2;
    const r = cs * 0.32;

    if (door.open) {
      // Open door: green circle with checkmark
      ctx.fillStyle = c.doorOpen;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cs * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', cx, cy);
    } else {
      // Closed door: red circle with lock
      ctx.fillStyle = c.door;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `${cs * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', cx, cy + 1);
    }
  }

  // ── Symbol icon ────────────────────────────────────────────────
  _drawSymbol(ctx, sym, gameState, c, cs, ox, oy) {
    const cx = ox + sym.x * cs + cs / 2;
    const cy = oy + sym.y * cs + cs / 2;
    const r = cs * 0.30;

    if (sym.found) {
      // Found: dimmed circle
      ctx.fillStyle = c.symbolFound;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // Active symbol: golden circle with category emoji or star
    const cat = sym._category;
    const icon = (cat && cat.icon) ? cat.icon : '⭐';

    // Glow effect
    ctx.shadowColor = c.symbol;
    ctx.shadowBlur = 8;
    ctx.fillStyle = c.symbol;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `${cs * 0.35}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, cy + 1);
  }

  // ── Start/Goal marker ─────────────────────────────────────────
  _drawMarker(ctx, x, y, label, color, c, cs, ox, oy) {
    const cx = ox + x * cs + cs / 2;
    const cy = oy + y * cs + cs / 2;

    if (label.length > 1) {
      // Emoji marker (goal)
      ctx.font = `${cs * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 1);
    } else {
      // Letter marker (start)
      ctx.fillStyle = color;
      ctx.font = `bold ${cs * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    }
  }

  // ── Team figures ───────────────────────────────────────────────
  _drawTeams(ctx, gameState, c, cs, ox, oy) {
    const teams = gameState.teams;
    if (!teams || teams.length === 0) return;

    // Group teams by position
    const posGroups = {};
    teams.forEach((team, i) => {
      const key = `${team.x},${team.y}`;
      if (!posGroups[key]) posGroups[key] = [];
      posGroups[key].push(i);
    });

    for (const key of Object.keys(posGroups)) {
      const indices = posGroups[key];
      const [tx, ty] = key.split(',').map(Number);
      const baseCx = ox + tx * cs + cs / 2;
      const baseCy = oy + ty * cs + cs / 2;

      // Offset positions if multiple teams on same cell
      const offsets = this._getMultiOffsets(indices.length, cs * 0.2);

      indices.forEach((teamIdx, offsetIdx) => {
        const team = teams[teamIdx];
        const isActive = teamIdx === gameState.currentTeamIdx;
        const figCx = baseCx + offsets[offsetIdx].dx;
        const figCy = baseCy + offsets[offsetIdx].dy;

        // Active team: pulsing glow ring
        if (isActive) {
          const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
          ctx.strokeStyle = c.teams[teamIdx % c.teams.length];
          ctx.lineWidth = 2;
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(figCx, figCy, cs * 0.35, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Figure background circle
        ctx.fillStyle = c.teams[teamIdx % c.teams.length];
        ctx.beginPath();
        ctx.arc(figCx, figCy, cs * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Figure emoji
        const emoji = team.emoji || this.FIGURES[teamIdx % this.FIGURES.length];
        const fontSize = isActive ? cs * 0.32 : cs * 0.28;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, figCx, figCy + 1);
      });
    }
  }

  _getMultiOffsets(count, spacing) {
    if (count === 1) return [{ dx: 0, dy: 0 }];
    if (count === 2) return [{ dx: -spacing, dy: 0 }, { dx: spacing, dy: 0 }];
    if (count === 3) return [
      { dx: 0, dy: -spacing },
      { dx: -spacing, dy: spacing * 0.6 },
      { dx: spacing, dy: spacing * 0.6 }
    ];
    // 4+: square arrangement
    const offsets = [];
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      offsets.push({
        dx: (col - (cols - 1) / 2) * spacing,
        dy: (row - (Math.ceil(count / cols) - 1) / 2) * spacing
      });
    }
    return offsets;
  }

  // ── Click detection ────────────────────────────────────────────
  getCellFromClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.clientWidth / (this.canvas.clientWidth); // CSS vs canvas
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const gx = Math.floor((mx - this.offsetX) / this.cellSize);
    const gy = Math.floor((my - this.offsetY) / this.cellSize);

    if (gx >= 0 && gx < this.maze.grid[0].length && gy >= 0 && gy < this.maze.grid.length) {
      return { x: gx, y: gy };
    }
    return null;
  }

  // ── Animate movement ──────────────────────────────────────────
  animateMove(teamIdx, fromX, fromY, toX, toY, callback) {
    const duration = 250; // ms
    const startTime = performance.now();
    const teams = this.gameState.teams;

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out quad
      const eased = 1 - (1 - t) * (1 - t);

      teams[teamIdx].x = fromX + (toX - fromX) * eased;
      teams[teamIdx].y = fromY + (toY - fromY) * eased;

      this.render(this.gameState);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        teams[teamIdx].x = toX;
        teams[teamIdx].y = toY;
        this.render(this.gameState);
        if (callback) callback();
      }
    };

    requestAnimationFrame(animate);
  }

  // ── Pulse animation for active team (called in game loop) ─────
  startPulseLoop() {
    const pulse = () => {
      if (this.gameState && this.maze) {
        this.render(this.gameState);
      }
      this._animationId = requestAnimationFrame(pulse);
    };
    this._animationId = requestAnimationFrame(pulse);
  }

  stopPulseLoop() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }
}
