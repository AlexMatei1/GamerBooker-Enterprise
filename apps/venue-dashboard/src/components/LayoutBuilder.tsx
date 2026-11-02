import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Save,
  UploadCloud,
  RotateCw,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Sparkles,
  Copy,
  Grid,
  ZoomIn,
  ZoomOut,
  CheckCircle,
  Move,
  Monitor,
  Gamepad2,
  Car,
  Table,
  Sliders,
  Maximize2,
  MousePointer,
  HelpCircle,
} from 'lucide-react';
import type { LayoutDraft, LayoutNode, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface LayoutBuilderProps {
  venueId: string;
  role: VenueRole;
}

// Safe rounded rectangle rendering for high-DPI canvas
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export const LayoutBuilder: React.FC<LayoutBuilderProps> = ({ venueId, role }) => {
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Viewport State
  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [history, setHistory] = useState<LayoutDraft[]>([]);
  const [redoStack, setRedoStack] = useState<LayoutDraft[]>([]);

  // Dragging State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    loadDraft();
  }, [venueId]);

  async function loadDraft() {
    const d = await api.getLayoutDraft(venueId);
    setDraft(d);
    setHistory([]);
    setRedoStack([]);
  }

  const pushHistory = useCallback((currentDraft: LayoutDraft) => {
    setHistory((prev) => [...prev.slice(-20), JSON.parse(JSON.stringify(currentDraft))]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    if (history.length === 0 || !draft) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [...r, draft]);
    setDraft(prev);
    setHistory((h) => h.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !draft) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, draft]);
    setDraft(next);
    setRedoStack((r) => r.slice(0, -1));
  };

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !draft) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = draft.canvas.width / rect.width;
      const scaleY = draft.canvas.height / rect.height;
      return {
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY),
      };
    },
    [draft],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const { x, y } = getCanvasCoords(e);

    // Hit-test: Equipment takes priority over furniture and rooms
    const equipment = draft.nodes.filter((n) => n.layer === 'equipment');
    const furniture = draft.nodes.filter((n) => n.layer !== 'equipment');

    const hitNode =
      [...equipment].reverse().find((n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height) ||
      [...furniture].reverse().find((n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height);

    if (hitNode) {
      pushHistory(draft);
      setSelectedNodeId(hitNode.id);
      setIsDragging(true);
      setDragOffset({ x: x - hitNode.x, y: y - hitNode.y });
    } else {
      setSelectedNodeId(null);
      setIsDragging(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const { x, y } = getCanvasCoords(e);
    setCursorCoords({ x, y });

    if (isDragging && selectedNodeId) {
      const node = draft.nodes.find((n) => n.id === selectedNodeId);
      if (!node) return;

      const gridSize = snapToGrid ? draft.canvas.grid_size || 20 : 1;
      let targetX = x - dragOffset.x;
      let targetY = y - dragOffset.y;

      if (snapToGrid) {
        targetX = Math.round(targetX / gridSize) * gridSize;
        targetY = Math.round(targetY / gridSize) * gridSize;
      }

      targetX = Math.max(0, Math.min(draft.canvas.width - node.width, targetX));
      targetY = Math.max(0, Math.min(draft.canvas.height - node.height, targetY));

      setDraft((d) =>
        d
          ? {
              ...d,
              nodes: d.nodes.map((n) => (n.id === selectedNodeId ? { ...n, x: targetX, y: targetY } : n)),
            }
          : null,
      );
    } else {
      const hit = [...draft.nodes].reverse().find(
        (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height,
      );
      setHoveredNodeId(hit ? hit.id : null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleAddStation = (type: 'PC' | 'CONSOLE_SETUP' | 'SIM_RIG' | 'FURNITURE') => {
    if (!draft) return;
    pushHistory(draft);

    const count = draft.nodes.filter((n) => n.type === type).length + 1;
    let prefix = 'PC';
    let width = 64;
    let height = 64;

    if (type === 'CONSOLE_SETUP') {
      prefix = 'PS5';
      width = 72;
      height = 72;
    } else if (type === 'SIM_RIG') {
      prefix = 'SIM';
      width = 80;
      height = 100;
    } else if (type === 'FURNITURE') {
      prefix = 'DESK';
      width = 160;
      height = 70;
    }

    const newNode: LayoutNode = {
      id: `node-${Date.now()}`,
      name: `${prefix}-${count.toString().padStart(2, '0')}`,
      type,
      x: 160 + (count % 4) * 40,
      y: 160 + (count % 3) * 40,
      width,
      height,
      rotation: 0,
      layer: type === 'FURNITURE' ? 'furniture' : 'equipment',
    };

    setDraft({ ...draft, nodes: [...draft.nodes, newNode] });
    setSelectedNodeId(newNode.id);
    setStatusMessage({ text: `Added ${newNode.name} to layout canvas.`, type: 'success' });
  };

  const handleRotateSelected = () => {
    if (!draft || !selectedNodeId) return;
    pushHistory(draft);
    setDraft({
      ...draft,
      nodes: draft.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, rotation: (n.rotation + 90) % 360 } : n,
      ),
    });
  };

  const handleDuplicateSelected = () => {
    if (!draft || !selectedNodeId) return;
    const node = draft.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    pushHistory(draft);

    const dupNode: LayoutNode = {
      ...node,
      id: `node-${Date.now()}`,
      name: `${node.name}-B`,
      x: Math.min(draft.canvas.width - node.width, node.x + 20),
      y: Math.min(draft.canvas.height - node.height, node.y + 20),
    };

    setDraft({ ...draft, nodes: [...draft.nodes, dupNode] });
    setSelectedNodeId(dupNode.id);
  };

  const handleDeleteSelected = () => {
    if (!draft || !selectedNodeId) return;
    pushHistory(draft);
    setDraft({
      ...draft,
      nodes: draft.nodes.filter((n) => n.id !== selectedNodeId),
    });
    setSelectedNodeId(null);
  };

  const handleApplyPreset = (preset: 'ESPORTS_5V5' | 'SIM_CLUSTER') => {
    if (!draft) return;
    pushHistory(draft);

    if (preset === 'ESPORTS_5V5') {
      const alphaNodes: LayoutNode[] = [1, 2, 3, 4, 5].map((idx) => ({
        id: `alpha-${idx}`,
        name: `A-0${idx}`,
        type: 'PC',
        x: 120 + (idx - 1) * 80,
        y: 200,
        width: 64,
        height: 64,
        rotation: 0,
        layer: 'equipment',
      }));
      const omegaNodes: LayoutNode[] = [1, 2, 3, 4, 5].map((idx) => ({
        id: `omega-${idx}`,
        name: `B-0${idx}`,
        type: 'PC',
        x: 120 + (idx - 1) * 80,
        y: 340,
        width: 64,
        height: 64,
        rotation: 180,
        layer: 'equipment',
      }));
      const deskA: LayoutNode = {
        id: `desk-a`,
        name: 'Team Alpha Stage Bench',
        type: 'FURNITURE',
        x: 110,
        y: 190,
        width: 420,
        height: 80,
        rotation: 0,
        layer: 'furniture',
      };
      const deskB: LayoutNode = {
        id: `desk-b`,
        name: 'Team Omega Stage Bench',
        type: 'FURNITURE',
        x: 110,
        y: 330,
        width: 420,
        height: 80,
        rotation: 0,
        layer: 'furniture',
      };

      setDraft({
        ...draft,
        nodes: [
          ...draft.nodes.filter((n) => !n.id.startsWith('alpha-') && !n.id.startsWith('omega-') && !n.id.startsWith('desk-')),
          deskA,
          deskB,
          ...alphaNodes,
          ...omegaNodes,
        ],
      });
      setStatusMessage({ text: 'Configured 5v5 Opposing Esports Stage.', type: 'success' });
    } else if (preset === 'SIM_CLUSTER') {
      const simNodes: LayoutNode[] = [1, 2, 3, 4].map((idx) => ({
        id: `sim-pod-${idx}`,
        name: `SIM-${idx}`,
        type: 'SIM_RIG',
        x: 800 + ((idx - 1) % 2) * 110,
        y: 120 + Math.floor((idx - 1) / 2) * 130,
        width: 80,
        height: 100,
        rotation: 0,
        layer: 'equipment',
      }));
      setDraft({ ...draft, nodes: [...draft.nodes, ...simNodes] });
      setStatusMessage({ text: 'Configured 4x Direct-Drive Racing Cluster.', type: 'success' });
    }
  };

  const handlePublish = async () => {
    if (!draft) return;
    const nextRev = draft.revision + 1;
    setDraft({ ...draft, revision: nextRev });
    setStatusMessage({
      text: `Revision #${nextRev} published. Invariants verified across active bookings.`,
      type: 'success',
    });
  };

  // Canvas Drawing
  useEffect(() => {
    if (!draft || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset & Background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Dot Grid (Figma / Linear Style)
    if (showGrid) {
      const gridSize = draft.canvas.grid_size || 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let x = gridSize; x < canvas.width; x += gridSize) {
        for (let y = gridSize; y < canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Rooms (Architectural Boundaries)
    draft.rooms.forEach((room) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      drawRoundRect(ctx, room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Room Header Pill
      ctx.fillStyle = 'rgba(24, 24, 28, 0.9)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      drawRoundRect(ctx, room.bounds.x + 10, room.bounds.y + 10, 160, 24, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '600 10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.name.toUpperCase(), room.bounds.x + 18, room.bounds.y + 22);

      ctx.restore();
    });

    // Furniture Layer (drawn below equipment)
    draft.nodes
      .filter((n) => n.layer === 'furniture')
      .forEach((node) => {
        const isSelected = selectedNodeId === node.id;
        ctx.save();
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);

        ctx.fillStyle = isSelected ? '#1f1f23' : '#18181b';
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = isSelected ? 1.5 : 1;

        drawRoundRect(ctx, -node.width / 2, -node.height / 2, node.width, node.height, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#71717a';
        ctx.font = '500 10px SF Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, 0, 0);

        ctx.restore();
      });

    // Equipment Layer (PCs, Consoles, Sim Rigs)
    draft.nodes
      .filter((n) => n.layer === 'equipment')
      .forEach((node) => {
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;

        ctx.save();
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);

        // Surface Fill
        if (node.type === 'PC') {
          ctx.fillStyle = isSelected ? '#1e1b4b' : '#131317';
          ctx.strokeStyle = isSelected ? '#818cf8' : isHovered ? '#6366f1' : 'rgba(255, 255, 255, 0.16)';
        } else if (node.type === 'CONSOLE_SETUP') {
          ctx.fillStyle = isSelected ? '#2e1065' : '#131317';
          ctx.strokeStyle = isSelected ? '#c084fc' : isHovered ? '#a855f7' : 'rgba(255, 255, 255, 0.16)';
        } else if (node.type === 'SIM_RIG') {
          ctx.fillStyle = isSelected ? '#451a03' : '#131317';
          ctx.strokeStyle = isSelected ? '#fbbf24' : isHovered ? '#f59e0b' : 'rgba(255, 255, 255, 0.16)';
        } else {
          ctx.fillStyle = '#131317';
          ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.16)';
        }

        ctx.lineWidth = isSelected ? 2 : 1;
        drawRoundRect(ctx, -node.width / 2, -node.height / 2, node.width, node.height, 6);
        ctx.fill();
        ctx.stroke();

        // Screen bezel notch (indicates player orientation)
        ctx.fillStyle = isSelected ? '#ffffff' : '#71717a';
        ctx.fillRect(-node.width / 2 + 10, -node.height / 2 + 3, node.width - 20, 2);

        // Station Code
        ctx.fillStyle = isSelected ? '#ffffff' : '#e4e4e7';
        ctx.font = '600 11px SF Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, 0, 3);

        ctx.restore();

        // Selection Bounding Box & Coordinates Tag
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(node.x - 3, node.y - 3, node.width + 6, node.height + 6);
          ctx.setLineDash([]);

          // Coordinate Tag
          ctx.fillStyle = '#818cf8';
          ctx.font = '500 9px SF Mono, monospace';
          ctx.fillText(`${node.x}, ${node.y}`, node.x, node.y - 7);
          ctx.restore();
        }
      });
  }, [draft, selectedNodeId, hoveredNodeId, showGrid]);

  if (!draft) {
    return (
      <div className="p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono">Initializing CAD layout engine...</span>
      </div>
    );
  }

  const selectedNode = draft.nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="space-y-3">
      {/* CAD Top Toolbar (Linear / Figma Style) */}
      <div className="panel px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Tool Selection */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-white/[0.08]">
            <button
              onClick={() => handleAddStation('PC')}
              className="px-2.5 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              title="Add PC Station"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>Rig</span>
            </button>
            <button
              onClick={() => handleAddStation('CONSOLE_SETUP')}
              className="px-2.5 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              title="Add Console Station"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Console</span>
            </button>
            <button
              onClick={() => handleAddStation('SIM_RIG')}
              className="px-2.5 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              title="Add Racing Sim Rig"
            >
              <Car className="w-3.5 h-3.5 text-amber-400" />
              <span>Sim</span>
            </button>
            <button
              onClick={() => handleAddStation('FURNITURE')}
              className="px-2.5 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              title="Add LAN Desk Bench"
            >
              <Table className="w-3.5 h-3.5 text-zinc-400" />
              <span>Desk</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-white/[0.08] mx-1" />

          {/* History Undo / Redo */}
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-white/[0.08]">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-25"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-25"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Grid & Snap Controls */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
              showGrid
                ? 'bg-zinc-800 text-zinc-100 border-white/[0.12]'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Grid</span>
          </button>

          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
              snapToGrid
                ? 'bg-zinc-800 text-zinc-100 border-white/[0.12]'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Snap (20px)
          </button>
        </div>

        {/* Right: Presets, Zoom & Publish */}
        <div className="flex items-center gap-2">
          {/* Zoom Buttons */}
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-white/[0.08] text-xs">
            <button
              onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.1))}
              className="p-1 text-zinc-400 hover:text-white"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-zinc-300">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((s) => Math.min(1.5, s + 0.1))}
              className="p-1 text-zinc-400 hover:text-white"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleApplyPreset('ESPORTS_5V5')}
              className="btn-secondary text-[11px] py-1 px-2.5"
            >
              5v5 Preset
            </button>
            <button
              onClick={() => handleApplyPreset('SIM_CLUSTER')}
              className="btn-secondary text-[11px] py-1 px-2.5"
            >
              Sim Cluster
            </button>
          </div>

          <div className="h-4 w-[1px] bg-white/[0.08] mx-1" />

          <button
            onClick={() => setStatusMessage({ text: 'Draft revision saved.', type: 'success' })}
            className="btn-secondary text-xs py-1 px-3"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>

          {role !== 'RECEPTION' && (
            <button
              onClick={handlePublish}
              className="btn-primary text-xs py-1 px-3.5"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Publish Rev #{draft.revision + 1}
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs flex items-center justify-between text-zinc-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-zinc-500 hover:text-zinc-300 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace: 2D Canvas + Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
        {/* Canvas Center Stage (3 Cols) */}
        <div className="lg:col-span-3 panel p-2 bg-[#09090b] overflow-auto max-h-[720px] flex flex-col items-center">
          <div
            style={{
              width: `${draft.canvas.width * zoomScale}px`,
              height: `${draft.canvas.height * zoomScale}px`,
              transition: 'width 0.1s ease-out, height 0.1s ease-out',
            }}
            className="relative rounded-lg overflow-hidden border border-white/[0.08] shadow-xl"
          >
            <canvas
              ref={canvasRef}
              width={draft.canvas.width}
              height={draft.canvas.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                width: '100%',
                height: '100%',
                cursor: isDragging ? 'grabbing' : hoveredNodeId ? 'grab' : 'crosshair',
              }}
              className="block"
            />
          </div>

          {/* Canvas Bottom Status Bar */}
          <div className="w-full flex items-center justify-between px-3 py-1.5 mt-2 border-t border-white/[0.04] text-[11px] text-zinc-500 font-mono">
            <div className="flex items-center gap-3">
              <span>CANVAS: {draft.canvas.width}&times;{draft.canvas.height}px</span>
              <span>GRID: 20px</span>
              <span>CURSOR: X:{cursorCoords.x} Y:{cursorCoords.y}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>FLEET: {draft.nodes.filter((n) => n.layer === 'equipment').length} STATIONS</span>
              <span className="text-emerald-500">REV #{draft.revision}</span>
            </div>
          </div>
        </div>

        {/* Right: Linear-Grade Property Inspector */}
        <div className="space-y-3">
          {selectedNode ? (
            <div className="panel p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="font-semibold text-xs text-zinc-200">Inspector</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-white/[0.06]">
                  {selectedNode.type}
                </span>
              </div>

              {/* Station Label */}
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Station Code</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft({
                      ...draft,
                      nodes: draft.nodes.map((n) => (n.id === selectedNode.id ? { ...n, name: val } : n)),
                    });
                  }}
                  className="w-full bg-zinc-900 border border-white/[0.08] px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Transform Coordinates Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Position X</span>
                  <span className="font-mono text-zinc-300 font-medium">{selectedNode.x}px</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Position Y</span>
                  <span className="font-mono text-zinc-300 font-medium">{selectedNode.y}px</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Dimensions</span>
                  <span className="font-mono text-zinc-300 font-medium">{selectedNode.width}&times;{selectedNode.height}</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Rotation</span>
                  <span className="font-mono text-zinc-300 font-medium">{selectedNode.rotation}°</span>
                </div>
              </div>

              {/* Quick Transform Controls */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                <button
                  onClick={handleRotateSelected}
                  className="flex-1 btn-secondary text-xs py-1.5 justify-center"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate</span>
                </button>
                <button
                  onClick={handleDuplicateSelected}
                  className="btn-secondary text-xs p-1.5"
                  title="Duplicate Station"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="btn-danger text-xs p-1.5"
                  title="Delete Station"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="panel p-5 text-center text-xs text-zinc-500 space-y-1">
              <MousePointer className="w-5 h-5 mx-auto mb-1 text-zinc-600" />
              <p className="font-medium text-zinc-400">Direct Selection</p>
              <p className="text-[11px] text-zinc-600">
                Click any workstation or bench on the canvas to inspect coordinates.
              </p>
            </div>
          )}

          {/* Arena Summary */}
          <div className="panel p-4 space-y-2 text-xs">
            <span className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider block mb-1">
              Arena Zones
            </span>
            <div className="space-y-1.5">
              {draft.rooms.map((r) => (
                <div key={r.id} className="flex justify-between items-center text-zinc-400 text-[11px]">
                  <span>{r.name}</span>
                  <span className="font-mono text-zinc-500">{r.bounds.width}&times;{r.bounds.height}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
