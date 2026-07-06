/* renderer.js – Mittelalter Canvas-Renderer v2 */

class MazeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maze = null;
    this.gameState = null;
    this.cellSize = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this._animId = null;
    this._colors = null;
    this._colorsTheme = null;
    // Bei Fenstergröße/Rotation neu skalieren und rendern — sonst bleibt
    // das Labyrinth nach Geräterotation abgeschnitten oder winzig.
    // Handler-Referenz speichern, damit destroy() ihn wieder abmelden kann.
    this._resizeTimer = null;
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (!this.maze) return;
        this.resize();
        if (this.gameState) this.render(this.gameState);
      }, 200);
    };
    window.addEventListener('resize', this._onResize);
  }

  // Muss vor dem Ersetzen eines Renderers aufgerufen werden — sonst
  // zeichnen alte Instanzen bei jedem Resize ihren alten State aufs Canvas
  destroy() {
    window.removeEventListener('resize', this._onResize);
    clearTimeout(this._resizeTimer);
    this.maze = null;
    this.gameState = null;
  }

  // ── Color cache ────────────────────────────────────────────────
  _c() {
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    if (this._colors && this._colorsTheme === theme) return this._colors;
    const s = getComputedStyle(document.body);
    const g = (v, fb) => s.getPropertyValue(v).trim() || fb;
    this._colors = {
      wall:         g('--maze-wall',         '#2c1810'),
      path:         g('--maze-path',         '#f5e6c8'),
      door:         g('--maze-door',         '#8b1a1a'),
      doorOpen:     g('--maze-door-open',    '#2d5a27'),
      validFree:    g('--maze-valid-free',   'rgba(201,162,39,0.35)'),
      validDoor:    g('--maze-valid-door',   'rgba(139,26,26,0.30)'),
      validSym:     g('--maze-valid-sym',    'rgba(80,40,160,0.30)'),
      gold:         g('--accent',            '#c9a227'),
      teams: [
        g('--team-1','#1a3a8f'), g('--team-2','#8f1a1a'),
        g('--team-3','#1a6b1a'), g('--team-4','#6b1a6b'),
        g('--team-5','#8f5a1a'), g('--team-6','#1a6b6b'),
      ]
    };
    this._colorsTheme = theme;
    return this._colors;
  }

  invalidateColors() { this._colors = null; }

  // ── Sizing ─────────────────────────────────────────────────────
  resize() {
    if (!this.maze || !this.canvas.parentElement) return;
    const parent = this.canvas.parentElement;
    const size = Math.min(parent.clientWidth, parent.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width  = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.width  = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = this.maze.grid[0].length;
    const rows = this.maze.grid.length;
    this.cellSize = Math.floor(size / Math.max(cols, rows));
    this.offsetX  = Math.floor((size - this.cellSize * cols) / 2);
    this.offsetY  = Math.floor((size - this.cellSize * rows) / 2);
  }

  setMaze(maze) {
    this.maze = maze;
    this.resize();
  }

  // ── Full render ────────────────────────────────────────────────
  render(gs) {
    this.gameState = gs;
    const ctx = this.ctx;
    const c   = this._c();
    const cs  = this.cellSize;
    const ox  = this.offsetX;
    const oy  = this.offsetY;
    const grid = this.maze.grid;
    const rows = grid.length;
    const cols = grid[0].length;

    // Background (dark stone for canvas area)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw all path backgrounds
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        this._drawPathBg(ctx, x, y, c, cs, ox, oy);

    // 2. Draw valid move highlights
    if (gs && (gs.phase === 'moving' || gs.phase === 'animating-dice')) {
      this._drawValidHighlights(ctx, gs, c, cs, ox, oy);
    }

    // 3. Draw walls (thick, stone)
    this._drawAllWalls(ctx, grid, c, cs, ox, oy, rows, cols);

    // 4. Draw stone corner squares
    this._drawCornerSquares(ctx, c, cs, ox, oy, rows, cols);

    // 5. Outer border
    ctx.strokeStyle = c.wall;
    ctx.lineWidth = 4;
    ctx.strokeRect(ox, oy, cols * cs, rows * cs);

    // 6. Door icons
    if (gs) gs.doors.forEach(d => this._drawDoor(ctx, d, c, cs, ox, oy));

    // 7. Team symbols
    if (gs) this._drawAllSymbols(ctx, gs, c, cs, ox, oy);

    // 8. Start position markers (faint, under figures)
    if (gs) this._drawStartMarkers(ctx, gs, c, cs, ox, oy);

    // 9. Team figures
    if (gs) this._drawTeamFigures(ctx, gs, c, cs, ox, oy);
  }

  // ── Path background ────────────────────────────────────────────
  _drawPathBg(ctx, x, y, c, cs, ox, oy) {
    // Alternating parchment shade for checkerboard texture
    const shade = (x + y) % 2 === 0 ? c.path : this._darkenHex(c.path, 8);
    ctx.fillStyle = shade;
    ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
  }

  _darkenHex(hex, amount) {
    // Simple darkening: parse rgb, subtract amount
    hex = hex.replace('#', '');
    const r = Math.max(0, parseInt(hex.substr(0,2),16) - amount);
    const g = Math.max(0, parseInt(hex.substr(2,2),16) - amount);
    const b = Math.max(0, parseInt(hex.substr(4,2),16) - amount);
    return `rgb(${r},${g},${b})`;
  }

  // ── Valid move highlights ──────────────────────────────────────
  _drawValidHighlights(ctx, gs, c, cs, ox, oy) {
    const validFree = gs._validFree || new Set();
    const validDoor = gs._validDoor || new Set();
    const validSym  = gs._validSym  || new Set();

    for (const key of validFree) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = c.validFree;
      ctx.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
    }
    for (const key of validDoor) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = c.validDoor;
      ctx.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
    }
    for (const key of validSym) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = c.validSym;
      ctx.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
    }
  }

  // ── Walls ──────────────────────────────────────────────────────
  _drawAllWalls(ctx, grid, c, cs, ox, oy, rows, cols) {
    ctx.strokeStyle = c.wall;
    ctx.lineWidth = Math.max(2.5, cs * 0.12);
    ctx.lineCap = 'square';

    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = ox + x * cs;
        const py = oy + y * cs;
        const cell = grid[y][x];
        if (cell.walls & 1) { ctx.moveTo(px, py);      ctx.lineTo(px + cs, py);      } // N
        if (cell.walls & 2) { ctx.moveTo(px + cs, py); ctx.lineTo(px + cs, py + cs); } // E
        if (cell.walls & 4) { ctx.moveTo(px, py + cs); ctx.lineTo(px + cs, py + cs); } // S
        if (cell.walls & 8) { ctx.moveTo(px, py);      ctx.lineTo(px, py + cs);      } // W
      }
    }
    ctx.stroke();
  }

  // ── Corner squares (stone block joints) ───────────────────────
  _drawCornerSquares(ctx, c, cs, ox, oy, rows, cols) {
    const sq = Math.max(2, Math.ceil(cs * 0.13));
    ctx.fillStyle = c.wall;
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= cols; x++)
        ctx.fillRect(ox + x * cs - sq / 2, oy + y * cs - sq / 2, sq, sq);
  }

  // ── Rotating door (wall segment) ──────────────────────────────
  _drawDoor(ctx, door, c, cs, ox, oy) {
    const alpha = door._alpha !== undefined ? door._alpha : 1;
    if (alpha <= 0) return;

    const { ax, ay, baseRad } = this._doorGeometry(door, cs, ox, oy);
    const openRad = door.rotDir * (door.angle || 0) * Math.PI / 180;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ax, ay);
    ctx.rotate(baseRad + openRad);

    const isFlipped = (door.angle || 0) !== 0;
    const lw = Math.max(3, cs * 0.13);
    ctx.strokeStyle = isFlipped ? '#a0702a' : '#8B4513';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cs, 0);
    ctx.stroke();

    // Hinge dot
    ctx.fillStyle = '#5c2d0a';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, cs * 0.07), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _doorGeometry(door, cs, ox, oy) {
    const x = door.cellX, y = door.cellY;
    const px = ox + x * cs, py = oy + y * cs;

    let ax, ay;
    switch (door.corner) {
      case 'NW': ax = px;      ay = py;      break;
      case 'NE': ax = px + cs; ay = py;      break;
      case 'SE': ax = px + cs; ay = py + cs; break;
      case 'SW': ax = px;      ay = py + cs; break;
    }

    // Angle from anchor toward door's far end when closed (canvas: East=0, South=π/2, West=π, North=-π/2)
    const baseAngles = {
      NE: { N: Math.PI,       E:  Math.PI / 2 },
      NW: { N: 0,             W:  Math.PI / 2 },
      SE: { S: Math.PI,       E: -Math.PI / 2 },
      SW: { S: 0,             W: -Math.PI / 2 },
    };
    return { ax, ay, baseRad: baseAngles[door.corner][door.blockedDir] };
  }

  // ── Team symbols ───────────────────────────────────────────────
  _drawAllSymbols(ctx, gs, c, cs, ox, oy) {
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 400);

    for (const sym of gs.allSymbols) {
      if (sym.found) continue;
      const cx = ox + sym.x * cs + cs / 2;
      const cy = oy + sym.y * cs + cs / 2;
      const teamColor = c.teams[sym.teamId % c.teams.length];
      const r = cs * 0.30;

      // Glow for active team's symbols
      const isActiveTeam = sym.teamId === gs.currentTeamIdx;
      if (isActiveTeam) {
        ctx.shadowColor = teamColor;
        ctx.shadowBlur  = 8 * pulse;
      }

      // Filled circle in team color
      ctx.fillStyle = teamColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Symbol icon (team-specific)
      const icon = gs.teams[sym.teamId] ? gs.teams[sym.teamId].symbolIcon : '⭐';
      ctx.font = `${cs * 0.32}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, cx, cy + 1);

      // Border ring
      ctx.strokeStyle = '#f5e6c8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Start markers ──────────────────────────────────────────────
  _drawStartMarkers(ctx, gs, c, cs, ox, oy) {
    if (!this.maze.startPositions) return;
    this.maze.startPositions.forEach((pos, i) => {
      const team = gs.teams[i];
      if (!team) return;
      const cx = ox + pos.x * cs + cs / 2;
      const cy = oy + pos.y * cs + cs / 2;
      // Faint colored corner marker
      ctx.fillStyle = c.teams[i % c.teams.length] + '33'; // 20% opacity
      ctx.fillRect(ox + pos.x * cs + 1, oy + pos.y * cs + 1, cs - 2, cs - 2);
      // Small flag
      ctx.font = `${cs * 0.28}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏠', cx, cy + 1);
    });
  }

  // ── Team figures ───────────────────────────────────────────────
  _drawTeamFigures(ctx, gs, c, cs, ox, oy) {
    const { teams, currentTeamIdx } = gs;
    if (!teams.length) return;

    // Group by position
    const groups = {};
    teams.forEach((t, i) => {
      const key = `${Math.round(t.x)},${Math.round(t.y)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(i);
    });

    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 280);

    for (const key of Object.keys(groups)) {
      const idxs = groups[key];
      const [tx, ty] = key.split(',').map(Number);
      const baseCx = ox + tx * cs + cs / 2;
      const baseCy = oy + ty * cs + cs / 2;
      const offsets = this._getOffsets(idxs.length, cs * 0.22);

      idxs.forEach((ti, oi) => {
        const team = teams[ti];
        const isActive = ti === currentTeamIdx;
        const fcx = baseCx + offsets[oi].dx;
        const fcy = baseCy + offsets[oi].dy;
        const teamColor = c.teams[ti % c.teams.length];

        // Active ring
        if (isActive) {
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = teamColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fcx, fcy, cs * 0.34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Figure circle
        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.arc(fcx, fcy, cs * 0.26, 0, Math.PI * 2);
        ctx.fill();

        // White ring
        ctx.strokeStyle = '#f5e6c8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fcx, fcy, cs * 0.26, 0, Math.PI * 2);
        ctx.stroke();

        // Figure emoji
        ctx.font = `${isActive ? cs * 0.30 : cs * 0.26}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(team.emoji || '🛡️', fcx, fcy + 1);
      });
    }
  }

  _getOffsets(count, spacing) {
    if (count === 1) return [{ dx: 0, dy: 0 }];
    if (count === 2) return [{ dx: -spacing, dy: 0 }, { dx: spacing, dy: 0 }];
    if (count === 3) return [
      { dx: 0, dy: -spacing * 0.8 },
      { dx: -spacing, dy: spacing * 0.6 },
      { dx: spacing, dy: spacing * 0.6 }
    ];
    const cols = Math.ceil(Math.sqrt(count));
    return Array.from({ length: count }, (_, i) => ({
      dx: ((i % cols) - (cols - 1) / 2) * spacing,
      dy: (Math.floor(i / cols) - (Math.ceil(count / cols) - 1) / 2) * spacing
    }));
  }

  // ── Click → cell ───────────────────────────────────────────────
  getCellFromClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const gx = Math.floor((mx - this.offsetX) / this.cellSize);
    const gy = Math.floor((my - this.offsetY) / this.cellSize);
    const cols = this.maze.grid[0].length;
    const rows = this.maze.grid.length;
    if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) return { x: gx, y: gy };
    return null;
  }

  // ── Animated move ──────────────────────────────────────────────
  animateMove(teamIdx, fromX, fromY, toX, toY, cb) {
    const duration = 220;
    const start = performance.now();
    const teams = this.gameState.teams;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const e = 1 - (1 - t) * (1 - t);  // ease-out
      teams[teamIdx].x = fromX + (toX - fromX) * e;
      teams[teamIdx].y = fromY + (toY - fromY) * e;
      this.render(this.gameState);
      if (t < 1) requestAnimationFrame(tick);
      else {
        teams[teamIdx].x = toX;
        teams[teamIdx].y = toY;
        this.render(this.gameState);
        if (cb) cb();
      }
    };
    requestAnimationFrame(tick);
  }

  // ── Door fade animation (verschwinden / auftauchen) ───────────
  // door: Referenz auf ein Tür-Objekt in this.gameState.doors
  // toAlpha: 0 = unsichtbar, 1 = voll sichtbar
  animateDoorAlpha(door, toAlpha, durationMs, cb) {
    const fromAlpha = door._alpha !== undefined ? door._alpha : 1;
    if (fromAlpha === toAlpha) { if (cb) cb(); return; }
    const duration = durationMs || 250;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); // ease-in-out
      door._alpha = fromAlpha + (toAlpha - fromAlpha) * ease;
      this.render(this.gameState);
      if (t < 1) requestAnimationFrame(tick);
      else {
        door._alpha = toAlpha;
        this.render(this.gameState);
        if (cb) cb();
      }
    };
    requestAnimationFrame(tick);
  }

  // ── Pulse loop ─────────────────────────────────────────────────
  startPulseLoop() {
    const loop = () => {
      if (this.gameState && this.maze) this.render(this.gameState);
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  }

  stopPulseLoop() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
  }
}
