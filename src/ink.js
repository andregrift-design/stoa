// Handwriting canvas for Apple Pencil (also works with mouse and finger).
// Strokes are stored normalized to the canvas width so they scale on every device.

import { html, useEffect, useRef, useState } from './ui.js';

const COLORS = ['#1f2a44', '#2f6fb0', '#c2413b', '#2e8b57'];
const HL = '#f5d547';

function drawStroke(ctx, s, w) {
  const p = s.p;
  if (p.length < 3) return;
  const scale = w / 600;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  if (s.t === 'hl') {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 16 * scale;
    ctx.beginPath();
    ctx.moveTo(p[0] * w, p[1] * w);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * w, p[i + 1] * w);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (p.length === 3) {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * w, 1.4 * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 3; i < p.length; i += 3) {
    ctx.lineWidth = Math.max(0.6, 2.4 * scale * (0.35 + p[i + 2]));
    ctx.beginPath();
    ctx.moveTo(p[i - 3] * w, p[i - 2] * w);
    ctx.lineTo(p[i] * w, p[i + 1] * w);
    ctx.stroke();
  }
}

export function InkPad({ strokes, onChange }) {
  const wrapRef = useRef();
  const canvasRef = useRef();
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const st = useRef({ strokes: strokes || [], cur: null, w: 0, h: 0, penSeen: false, drawing: false });

  if (!st.current.drawing) st.current.strokes = strokes || [];

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const { w, h } = st.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const s of st.current.strokes) drawStroke(ctx, s, w);
    if (st.current.cur) drawStroke(ctx, st.current.cur, w);
  };

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      st.current.w = r.width;
      st.current.h = r.height;
      canvasRef.current.width = Math.round(r.width * dpr);
      canvasRef.current.height = Math.round(r.height * dpr);
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(redraw, [strokes]);

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const w = st.current.w || r.width;
    const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    const round = (v) => Math.round(v * 10000) / 10000;
    return [round((e.clientX - r.left) / w), round((e.clientY - r.top) / w), Math.round(pr * 100) / 100];
  };

  const erase = (e) => {
    const [x, y] = point(e);
    const rad = 12 / (st.current.w || 600);
    const before = st.current.strokes.length;
    st.current.strokes = st.current.strokes.filter((s) => {
      for (let i = 0; i < s.p.length; i += 3) {
        if (Math.hypot(s.p[i] - x, s.p[i + 1] - y) < rad) return false;
      }
      return true;
    });
    if (st.current.strokes.length !== before) redraw();
  };

  const down = (e) => {
    if (e.pointerType === 'pen') st.current.penSeen = true;
    // Palm rejection: once a Pencil is used, ignore finger touches on the canvas.
    if (st.current.penSeen && e.pointerType === 'touch') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    st.current.drawing = true;
    if (tool === 'eraser') return erase(e);
    st.current.cur = { t: tool === 'hl' ? 'hl' : 'pen', c: tool === 'hl' ? HL : color, p: point(e) };
    redraw();
  };

  const move = (e) => {
    if (!st.current.drawing) return;
    if (tool === 'eraser') return erase(e);
    const cur = st.current.cur;
    if (!cur) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of events.length ? events : [e]) {
      const pt = point(ce);
      cur.p.push(...pt);
    }
    redraw();
  };

  const up = () => {
    if (!st.current.drawing) return;
    st.current.drawing = false;
    if (st.current.cur) st.current.strokes = [...st.current.strokes, st.current.cur];
    st.current.cur = null;
    onChange(st.current.strokes);
  };

  const undo = () => onChange(st.current.strokes.slice(0, -1));
  const clear = () => confirm('Clear this page?') && onChange([]);

  return html`
    <div class="ink">
      <div class="ink-tools" role="toolbar">
        ${COLORS.map((c) => html`
          <button class="swatch ${tool === 'pen' && color === c ? 'on' : ''}" style=${`--c:${c}`}
            aria-label="Pen color" onClick=${() => { setTool('pen'); setColor(c); }}></button>`)}
        <button class="tool ${tool === 'hl' ? 'on' : ''}" onClick=${() => setTool('hl')} title="Highlighter">Highlight</button>
        <button class="tool ${tool === 'eraser' ? 'on' : ''}" onClick=${() => setTool('eraser')} title="Eraser">Erase</button>
        <span class="spacer"></span>
        <button class="tool" onClick=${undo} title="Undo">Undo</button>
        <button class="tool" onClick=${clear} title="Clear">Clear</button>
      </div>
      <div class="ink-surface" ref=${wrapRef}>
        <canvas ref=${canvasRef} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}></canvas>
      </div>
    </div>`;
}
