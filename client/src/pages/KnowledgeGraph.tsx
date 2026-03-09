import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  type: 'article' | 'concept';
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  // article-specific
  url?: string;
  summary?: string;
  category?: string;
  domain?: string;
  key_concepts?: string[];
  created_at?: string;
  slack_channel_id?: string;
  // concept-specific
  count?: number;
  article_ids?: number[];
}

interface GraphEdge {
  source: string;
  target: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  article: '#60a5fa',
  tool:    '#a78bfa',
  video:   '#f87171',
  doc:     '#34d399',
  other:   '#94a3b8',
};

const CONCEPT_COLOR = '#818cf8';
const BG_COLOR = '#07070f';
const EDGE_COLOR = 'rgba(255,255,255,0.07)';
const EDGE_SELECTED = 'rgba(251,191,36,0.5)';
const SELECTED_COLOR = '#fbbf24';

// ── Force simulation ───────────────────────────────────────────────────────────

function runForces(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const REPULSION = 5000;
  const SPRING = 0.025;
  const IDEAL_DIST = 140;
  const GRAVITY = 0.004;
  const DAMPING = 0.82;

  // Repulsion between all node pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist2 = Math.max(dx * dx + dy * dy, 1);
      const dist = Math.sqrt(dist2);
      const force = REPULSION / dist2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }

  // Spring attraction along edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const displacement = dist - IDEAL_DIST;
    const force = SPRING * displacement;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  const cx = width / 2, cy = height / 2;
  for (const n of nodes) {
    n.vx += (cx - n.x) * GRAVITY;
    n.vy += (cy - n.y) * GRAVITY;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    // Clamp to canvas bounds with padding
    n.x = Math.max(n.radius + 8, Math.min(width - n.radius - 8, n.x));
    n.y = Math.max(n.radius + 8, Math.min(height - n.radius - 8, n.y));
  }
}

// ── Canvas draw ────────────────────────────────────────────────────────────────

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  selected: string | null,
  hovered: string | null,
  transform: { x: number; y: number; scale: number },
  dpr: number
) {
  const { x: tx, y: ty, scale } = transform;
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  // Draw background gradient
  const grad = ctx.createRadialGradient(
    ctx.canvas.width / dpr / 2, ctx.canvas.height / dpr / 2, 0,
    ctx.canvas.width / dpr / 2, ctx.canvas.height / dpr / 2,
    ctx.canvas.width / dpr
  );
  grad.addColorStop(0, '#0e0e1a');
  grad.addColorStop(1, BG_COLOR);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Determine highlighted nodes (connected to selected/hovered)
  const focusId = selected || hovered;
  const connected = new Set<string>();
  if (focusId) {
    connected.add(focusId);
    for (const e of edges) {
      if (e.source === focusId) connected.add(e.target);
      if (e.target === focusId) connected.add(e.source);
    }
  }

  // Draw edges
  for (const edge of edges) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t) continue;

    const isHighlighted = focusId && (connected.has(edge.source) || connected.has(edge.target));
    const isFocusEdge = focusId && (edge.source === focusId || edge.target === focusId);

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = isFocusEdge ? EDGE_SELECTED : isHighlighted ? 'rgba(255,255,255,0.15)' : EDGE_COLOR;
    ctx.lineWidth = isFocusEdge ? 1.5 : 0.8;
    ctx.stroke();
  }

  // Draw nodes (back to front: concept nodes first)
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'concept' ? -1 : 1;
    return 0;
  });

  for (const node of sortedNodes) {
    const isFocused = node.id === focusId;
    const isConnected = connected.has(node.id);
    const alpha = focusId ? (isConnected ? 1 : 0.15) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (node.type === 'article') {
      // Outer glow for selected
      if (isFocused) {
        const glow = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, node.radius * 2.5);
        glow.addColorStop(0, `${node.color}40`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Circle background
      const bgGrad = ctx.createRadialGradient(node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0, node.x, node.y, node.radius);
      bgGrad.addColorStop(0, `${node.color}33`);
      bgGrad.addColorStop(1, `${node.color}11`);
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = isFocused ? SELECTED_COLOR : isConnected ? node.color : `${node.color}66`;
      ctx.lineWidth = isFocused ? 2.5 : 1.5;
      ctx.stroke();

      // Domain favicon-style initial
      ctx.fillStyle = isFocused ? SELECTED_COLOR : node.color;
      ctx.font = `bold ${Math.max(10, node.radius * 0.45)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((node.domain || node.label || '?')[0].toUpperCase(), node.x, node.y);

      // Label below
      ctx.fillStyle = isFocused ? '#fff' : isConnected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.font = `${isFocused ? 600 : 400} ${Math.min(11, node.radius * 0.42)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const label = node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label;
      ctx.fillText(label, node.x, node.y + node.radius + 5);

    } else {
      // Concept node — pill shape
      const isConceptFocused = isFocused;
      const pill_h = 20;
      const text_w = Math.max(50, ctx.measureText(node.label).width + 20);

      // Pill background
      ctx.fillStyle = isConceptFocused
        ? 'rgba(129,140,248,0.25)'
        : isConnected
          ? 'rgba(129,140,248,0.12)'
          : 'rgba(129,140,248,0.05)';
      roundRect(ctx, node.x - text_w / 2, node.y - pill_h / 2, text_w, pill_h, pill_h / 2);
      ctx.fill();

      ctx.strokeStyle = isConceptFocused ? CONCEPT_COLOR : isConnected ? `${CONCEPT_COLOR}80` : `${CONCEPT_COLOR}30`;
      ctx.lineWidth = isConceptFocused ? 1.5 : 0.8;
      roundRect(ctx, node.x - text_w / 2, node.y - pill_h / 2, text_w, pill_h, pill_h / 2);
      ctx.stroke();

      // Concept count dot
      if (node.count && node.count > 1) {
        ctx.fillStyle = CONCEPT_COLOR;
        ctx.beginPath();
        ctx.arc(node.x + text_w / 2 - 8, node.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#07070f';
        ctx.font = 'bold 6px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.count), node.x + text_w / 2 - 8, node.y);
      }

      ctx.fillStyle = isConceptFocused ? '#c7d2fe' : isConnected ? '#a5b4fc' : 'rgba(165,180,252,0.5)';
      ctx.font = `${isConceptFocused ? 600 : 400} 10px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, node.x, node.y);
    }

    ctx.restore();
  }

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
  ctx.closePath();
}

// ── Hit testing ────────────────────────────────────────────────────────────────

function hitTest(nodes: GraphNode[], mx: number, my: number, transform: { x: number; y: number; scale: number }): GraphNode | null {
  const { x: tx, y: ty, scale } = transform;
  const wx = (mx - tx) / scale;
  const wy = (my - ty) / scale;

  for (const n of nodes) {
    if (n.type === 'article') {
      const dx = wx - n.x, dy = wy - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius) return n;
    } else {
      const w = 80; // approximate pill width
      if (Math.abs(wx - n.x) <= w / 2 && Math.abs(wy - n.y) <= 12) return n;
    }
  }
  return null;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ nodeId: string | null; panStart: { x: number; y: number; tx: number; ty: number } | null }>({ nodeId: null, panStart: null });

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [rawData, setRawData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [simPaused, setSimPaused] = useState(false);
  const navigate = useNavigate();

  const selectedNode = selected ? nodesRef.current.find(n => n.id === selected) : null;

  // Load graph data
  useEffect(() => {
    setLoading(true);
    api.tasks.knowledgeGraph()
      .then(data => {
        setRawData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Build node/edge arrays from raw data
  useEffect(() => {
    if (!rawData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.clientWidth || 1000;
    const H = canvas.clientHeight || 700;

    const newNodes: GraphNode[] = rawData.nodes.map(n => ({
      ...n,
      x: W / 2 + (Math.random() - 0.5) * W * 0.5,
      y: H / 2 + (Math.random() - 0.5) * H * 0.5,
      vx: 0,
      vy: 0,
      radius: n.type === 'article' ? Math.max(24, Math.min(42, 24 + (n.key_concepts?.length || 0) * 3)) : 0,
      color: n.type === 'article' ? (CAT_COLORS[n.category] || CAT_COLORS.other) : CONCEPT_COLOR,
    }));

    nodesRef.current = newNodes;
    edgesRef.current = rawData.edges;
    transformRef.current = { x: 0, y: 0, scale: 1 };
  }, [rawData]);

  // Animation loop
  useEffect(() => {
    if (loading || !rawData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let frame = 0;

    const loop = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      // Resize canvas if needed
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
      }

      if (!simPaused && frame < 800) {
        runForces(nodesRef.current, edgesRef.current, W, H);
        frame++;
      }

      drawGraph(ctx, nodesRef.current, edgesRef.current, selected, hovered, transformRef.current, dpr);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [loading, rawData, selected, hovered, simPaused]);

  // Mouse events
  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasPos(e);
    const { nodeId, panStart } = dragRef.current;

    if (nodeId) {
      // Drag node
      const t = transformRef.current;
      const wx = (x - t.x) / t.scale;
      const wy = (y - t.y) / t.scale;
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (node) { node.x = wx; node.y = wy; node.vx = 0; node.vy = 0; }
    } else if (panStart) {
      // Pan
      transformRef.current.x = panStart.tx + (x - panStart.x);
      transformRef.current.y = panStart.ty + (y - panStart.y);
    } else {
      // Hover
      const hit = hitTest(nodesRef.current, x, y, transformRef.current);
      setHovered(hit?.id || null);
      canvasRef.current!.style.cursor = hit ? 'pointer' : 'grab';
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(nodesRef.current, x, y, transformRef.current);
    if (hit) {
      dragRef.current = { nodeId: hit.id, panStart: null };
    } else {
      dragRef.current = { nodeId: null, panStart: { x, y, tx: transformRef.current.x, ty: transformRef.current.y } };
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const { nodeId } = dragRef.current;
    if (nodeId) {
      // Was dragging a node — treat as click if barely moved
      const { x, y } = getCanvasPos(e);
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (node) {
        const t = transformRef.current;
        const wx = (x - t.x) / t.scale;
        const wy = (y - t.y) / t.scale;
        const dist = Math.hypot(wx - node.x, wy - node.y);
        if (dist < 5) {
          setSelected(prev => prev === nodeId ? null : nodeId);
        }
      }
    }
    dragRef.current = { nodeId: null, panStart: null };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = getCanvasPos(e as any);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const t = transformRef.current;
    const newScale = Math.max(0.2, Math.min(4, t.scale * delta));
    const scaleRatio = newScale / t.scale;
    t.x = x - scaleRatio * (x - t.x);
    t.y = y - scaleRatio * (y - t.y);
    t.scale = newScale;
  }, []);

  // Filter nodes by search
  const highlightedIds = search.trim()
    ? new Set(nodesRef.current.filter(n => n.label.toLowerCase().includes(search.toLowerCase())).map(n => n.id))
    : null;

  const articleNodes = nodesRef.current.filter(n => n.type === 'article');
  const conceptNodes = nodesRef.current.filter(n => n.type === 'concept');

  return (
    <div style={{ display: 'flex', height: '100vh', background: BG_COLOR, overflow: 'hidden', position: 'relative' }}>

      {/* Left sidebar */}
      <div style={{
        width: 220, flexShrink: 0, background: 'rgba(14,14,26,0.95)', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', zIndex: 10,
      }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => navigate('/reading-list')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ← Reading List
          </button>
          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
            ✦ Knowledge Graph
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
            {articleNodes.length} articles · {conceptNodes.length} concepts
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Filter nodes..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 6 }}>
          <button
            onClick={() => { transformRef.current = { x: 0, y: 0, scale: 1 }; }}
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.6)', fontSize: 10, cursor: 'pointer', padding: '4px 0' }}
          >
            Reset View
          </button>
          <button
            onClick={() => setSimPaused(p => !p)}
            style={{ flex: 1, background: simPaused ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${simPaused ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: simPaused ? '#fbbf24' : 'rgba(255,255,255,0.6)', fontSize: 10, cursor: 'pointer', padding: '4px 0' }}
          >
            {simPaused ? '▶ Resume' : '⏸ Freeze'}
          </button>
        </div>

        {/* Top concepts list */}
        <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Top Concepts
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
          {[...conceptNodes]
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 20)
            .map(n => (
              <div
                key={n.id}
                onClick={() => setSelected(prev => prev === n.id ? null : n.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', borderRadius: 6, marginBottom: 3, cursor: 'pointer',
                  background: selected === n.id ? 'rgba(129,140,248,0.15)' : 'transparent',
                  border: `1px solid ${selected === n.id ? 'rgba(129,140,248,0.3)' : 'transparent'}`,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected === n.id ? 'rgba(129,140,248,0.15)' : 'transparent'; }}
              >
                <span style={{ fontSize: 11, color: selected === n.id ? '#c7d2fe' : 'rgba(255,255,255,0.5)' }}>{n.label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(129,140,248,0.2)', color: '#818cf8', borderRadius: 8, padding: '1px 5px' }}>{n.count}</span>
              </div>
            ))}
          {conceptNodes.length === 0 && !loading && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', paddingTop: 20 }}>
              No concepts yet.<br />Save articles to build your graph.
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {cat}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            <div style={{ width: 18, height: 8, borderRadius: 4, border: `1px solid ${CONCEPT_COLOR}`, flexShrink: 0 }} />
            concept
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'rgba(255,255,255,0.4)', zIndex: 5 }}>
            <div style={{ width: 40, height: 40, border: '2px solid rgba(251,191,36,0.3)', borderTop: '2px solid #fbbf24', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 13 }}>Loading knowledge graph…</div>
          </div>
        )}

        {!loading && rawData && rawData.nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'rgba(255,255,255,0.3)', zIndex: 5 }}>
            <div style={{ fontSize: 52 }}>✦</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Your knowledge graph is empty</div>
              <div style={{ fontSize: 13 }}>Go to Reading List and click 🔖 to save & summarize articles</div>
            </div>
            <button onClick={() => navigate('/reading-list')} style={{ marginTop: 8, padding: '8px 18px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, color: '#fbbf24', cursor: 'pointer', fontSize: 13 }}>
              Go to Reading List →
            </button>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 16px', color: '#f87171', fontSize: 13, zIndex: 5 }}>
            Error: {error}
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHovered(null); dragRef.current = { nodeId: null, panStart: null }; }}
          onWheel={handleWheel}
        />

        {/* Zoom hints */}
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>
          Scroll to zoom · Drag to pan · Click node to inspect
        </div>
      </div>

      {/* Right panel — selected node details */}
      {selectedNode && (
        <div style={{
          width: 300, flexShrink: 0, background: 'rgba(14,14,26,0.97)', borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 10,
          animation: 'slideInRight 0.2s ease',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedNode.type === 'article' ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: CAT_COLORS[selectedNode.category || 'other'], letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {selectedNode.category}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>
                    {selectedNode.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{selectedNode.domain}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: CONCEPT_COLOR, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Concept
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#c7d2fe' }}>
                    {selectedNode.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                    Appears in {selectedNode.count} article{selectedNode.count !== 1 ? 's' : ''}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {selectedNode.type === 'article' ? (
              <>
                {/* Summary */}
                {selectedNode.summary && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>✦ AI Summary</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '10px 12px' }}>
                      {selectedNode.summary}
                    </div>
                  </div>
                )}

                {/* Key concepts */}
                {selectedNode.key_concepts && selectedNode.key_concepts.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Key Concepts</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {selectedNode.key_concepts.map((c: string) => (
                        <span
                          key={c}
                          onClick={() => setSelected(`concept_${c}`)}
                          style={{
                            fontSize: 11, padding: '3px 9px', borderRadius: 12,
                            background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)',
                            color: '#a5b4fc', cursor: 'pointer', transition: 'all 0.1s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,0.2)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,0.1)'; }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open link */}
                {selectedNode.url && (
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                      background: `${CAT_COLORS[selectedNode.category || 'other']}15`,
                      border: `1px solid ${CAT_COLORS[selectedNode.category || 'other']}30`,
                      borderRadius: 8, color: CAT_COLORS[selectedNode.category || 'other'],
                      textDecoration: 'none', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${CAT_COLORS[selectedNode.category || 'other']}25`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${CAT_COLORS[selectedNode.category || 'other']}15`; }}
                  >
                    <span>↗</span> Open Article
                  </a>
                )}
              </>
            ) : (
              /* Concept node — list related articles */
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>Related Articles</div>
                {nodesRef.current
                  .filter(n => n.type === 'article' && n.key_concepts?.includes(selectedNode.label))
                  .map(article => (
                    <div
                      key={article.id}
                      onClick={() => setSelected(article.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS[article.category || 'other'], flexShrink: 0 }} />
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {article.label}
                        </div>
                      </div>
                      {article.summary && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {article.summary}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}
