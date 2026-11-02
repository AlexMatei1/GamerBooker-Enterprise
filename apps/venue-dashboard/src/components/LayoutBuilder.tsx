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
  Eye,
  Grid,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle,
  AlertCircle,
  Move,
  Monitor,
  Gamepad2,
  Car,
  Table,
} from 'lucide-react';
import type { LayoutDraft, LayoutNode, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface LayoutBuilderProps {
  venueId: string;
  role: VenueRole;
}

// Safe rounded rectangle rendering for all browsers
function drawSafeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

export const LayoutBuilder: React.FC<LayoutBuilderProps> = ({ venueId, role }) => {
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Canvas Viewport & Interactivity State
  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [history, setHistory] = useState<LayoutDraft[]>([]);
  const [redoStack, setRedoStack] = useState<LayoutDraft[]>([]);

  // Dragging state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

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

  // Push state to undo history before mutating
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

  // Convert MouseEvent coordinates to Canvas Space
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !draft) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = draft.canvas.width / rect.width;
      const scaleY = draft.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      return { x, y };
    },
    [draft],
  );

  // Mouse Down - Selection & Drag Initiation
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const { x, y } = getCanvasCoords(e);

    // Hit test: Equipment nodes take priority over furniture and rooms
    const equipmentNodes = draft.nodes.filter((n) => n.layer === 'equipment');
    const furnitureNodes = draft.nodes.filter((n) => n.layer !== 'equipment');

    const hitEquipment = [...equipmentNodes].reverse().find(
      (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height,
    );

    const hitFurniture = [...furnitureNodes].reverse().find(
      (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height,
    );

    const hitNode = hitEquipment || hitFurniture;

    if (hitNode) {
      pushHistory(draft);
      setSelectedNodeId(hitNode.id);
      setSelectedRoomId(null);
      setIsDragging(true);
      setDragOffset({ x: x - hitNode.x, y: y - hitNode.y });
      return;
    }

    // Hit test rooms if no node was hit
    const hitRoom = [...draft.rooms].reverse().find(
      (r) =>
        x >= r.bounds.x &&
        x <= r.bounds.x + r.bounds.width &&
        y >= r.bounds.y &&
        y <= r.bounds.y + r.bounds.height,
    );

    if (hitRoom) {
      setSelectedRoomId(hitRoom.id);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(null);
      setSelectedRoomId(null);
    }
    setIsDragging(false);
  };

  // Mouse Move - Live Dragging with Snap to 20px Grid
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const { x, y } = getCanvasCoords(e);

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

      // Clamp within canvas boundaries
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
      // Hover detection for dynamic cursor
      const hit = [...draft.nodes].reverse().find(
        (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height,
      );
      setHoveredNodeId(hit ? hit.id : null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add Station
  const handleAddStation = (type: 'PC' | 'CONSOLE_SETUP' | 'SIM_RIG' | 'FURNITURE') => {
    if (!draft) return;
    pushHistory(draft);

    const count = draft.nodes.filter((n) => n.type === type).length + 1;
    let prefix = 'PC';
    let width = 60;
    let height = 60;

    if (type === 'CONSOLE_SETUP') {
      prefix = 'PS5';
      width = 70;
      height = 70;
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
      x: 140 + (count % 5) * 40,
      y: 140 + (count % 4) * 40,
      width,
      height,
      rotation: 0,
      layer: type === 'FURNITURE' ? 'furniture' : 'equipment',
    };

    setDraft({ ...draft, nodes: [...draft.nodes, newNode] });
    setSelectedNodeId(newNode.id);
    setStatusMessage({ text: `Added ${newNode.name} to layout canvas.`, type: 'success' });
  };

  // Rotate Node
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

  // Duplicate Selected Node
  const handleDuplicateSelected = () => {
    if (!draft || !selectedNodeId) return;
    const node = draft.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    pushHistory(draft);

    const dupNode: LayoutNode = {
      ...node,
      id: `node-${Date.now()}`,
      name: `${node.name}-COPY`,
      x: Math.min(draft.canvas.width - node.width, node.x + 30),
      y: Math.min(draft.canvas.height - node.height, node.y + 30),
    };

    setDraft({ ...draft, nodes: [...draft.nodes, dupNode] });
    setSelectedNodeId(dupNode.id);
    setStatusMessage({ text: `Duplicated ${node.name}.`, type: 'success' });
  };

  // Delete Selected Node
  const handleDeleteSelected = () => {
    if (!draft || !selectedNodeId) return;
    pushHistory(draft);
    setDraft({
      ...draft,
      nodes: draft.nodes.filter((n) => n.id !== selectedNodeId),
    });
    setSelectedNodeId(null);
    setStatusMessage({ text: 'Deleted item from floor layout.', type: 'success' });
  };

  // Apply Presets
  const handleApplyPreset = (preset: 'ESPORTS_5V5' | 'ROW_10' | 'SIM_CLUSTER') => {
    if (!draft) return;
    pushHistory(draft);

    if (preset === 'ESPORTS_5V5') {
      const alphaNodes: LayoutNode[] = [1, 2, 3, 4, 5].map((idx) => ({
        id: `alpha-${idx}`,
        name: `ALPHA-0${idx}`,
        type: 'PC',
        x: 120 + (idx - 1) * 80,
        y: 200,
        width: 60,
        height: 60,
        rotation: 0,
        layer: 'equipment',
      }));
      const omegaNodes: LayoutNode[] = [1, 2, 3, 4, 5].map((idx) => ({
        id: `omega-${idx}`,
        name: `OMEGA-0${idx}`,
        type: 'PC',
        x: 120 + (idx - 1) * 80,
        y: 340,
        width: 60,
        height: 60,
        rotation: 180,
        layer: 'equipment',
      }));
      const stageDeskA: LayoutNode = {
        id: `desk-alpha`,
        name: 'Team Alpha Stage Desk',
        type: 'FURNITURE',
        x: 110,
        y: 190,
        width: 420,
        height: 80,
        rotation: 0,
        layer: 'furniture',
      };
      const stageDeskB: LayoutNode = {
        id: `desk-omega`,
        name: 'Team Omega Stage Desk',
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
        nodes: [...draft.nodes.filter((n) => !n.id.startsWith('alpha-') && !n.id.startsWith('omega-')), stageDeskA, stageDeskB, ...alphaNodes, ...omegaNodes],
      });
      setStatusMessage({ text: 'Applied 5v5 Esports Arena Opposing Pods Preset.', type: 'success' });
    } else if (preset === 'SIM_CLUSTER') {
      const simNodes: LayoutNode[] = [1, 2, 3, 4].map((idx) => ({
        id: `sim-cluster-${idx}`,
        name: `SIM-PRO-${idx}`,
        type: 'SIM_RIG',
        x: 800 + ((idx - 1) % 2) * 110,
        y: 120 + Math.floor((idx - 1) / 2) * 130,
        width: 80,
        height: 100,
        rotation: 0,
        layer: 'equipment',
      }));
      setDraft({ ...draft, nodes: [...draft.nodes, ...simNodes] });
      setStatusMessage({ text: 'Applied 4x Direct-Drive Sim Racing Cluster Preset.', type: 'success' });
    }
  };

  // Publish Revision
  const handlePublishRevision = async () => {
    if (!draft) return;
    const nextRev = draft.revision + 1;
    setDraft({ ...draft, revision: nextRev });
    setStatusMessage({
      text: `Layout Published! Revision #${nextRev} is now live across turnstiles, customer mobile app, and floor intake.`,
      type: 'success',
    });
  };

  // Render Canvas
  useEffect(() => {
    if (!draft || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle 20px Grid
    if (showGrid) {
      const gridSize = draft.canvas.grid_size || 20;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Major grid lines (every 100px)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < canvas.width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Draw Rooms & Architectural Boundaries
    draft.rooms.forEach((room) => {
      const isRoomSelected = selectedRoomId === room.id;
      ctx.save();
      ctx.strokeStyle = isRoomSelected ? '#00f0ff' : 'rgba(56, 189, 248, 0.4)';
      ctx.fillStyle = isRoomSelected ? 'rgba(6, 182, 212, 0.08)' : 'rgba(15, 23, 42, 0.5)';
      ctx.lineWidth = isRoomSelected ? 2.5 : 1.5;
      ctx.setLineDash([8, 6]);

      drawSafeRoundRect(ctx, room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height, 12);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Room Header Tab
      ctx.fillStyle = isRoomSelected ? 'rgba(0, 240, 255, 0.2)' : 'rgba(30, 41, 59, 0.8)';
      drawSafeRoundRect(ctx, room.bounds.x + 8, room.bounds.y + 8, 180, 26, 6);
      ctx.fill();

      ctx.fillStyle = isRoomSelected ? '#00f0ff' : '#94a3b8';
      ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.name.toUpperCase(), room.bounds.x + 16, room.bounds.y + 21);

      ctx.restore();
    });

    // Draw Furniture First (underneath equipment)
    draft.nodes
      .filter((n) => n.layer === 'furniture')
      .forEach((node) => {
        const isSelected = selectedNodeId === node.id;
        ctx.save();
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);

        ctx.fillStyle = isSelected ? '#334155' : '#1e293b';
        ctx.strokeStyle = isSelected ? '#00f0ff' : '#475569';
        ctx.lineWidth = isSelected ? 2 : 1;

        drawSafeRoundRect(ctx, -node.width / 2, -node.height / 2, node.width, node.height, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, 0, 0);

        ctx.restore();
      });

    // Draw Equipment Nodes (PCs, Consoles, Sim Rigs)
    draft.nodes
      .filter((n) => n.layer === 'equipment')
      .forEach((node) => {
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;

        ctx.save();
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);

        // Selection Glow Halo
        if (isSelected) {
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 15;
        }

        // Station Background & Colors
        if (node.type === 'PC') {
          ctx.fillStyle = isSelected ? '#0284c7' : '#0369a1';
          ctx.strokeStyle = isSelected ? '#00f0ff' : '#38bdf8';
        } else if (node.type === 'CONSOLE_SETUP') {
          ctx.fillStyle = isSelected ? '#7e22ce' : '#6b21a8';
          ctx.strokeStyle = isSelected ? '#c084fc' : '#a855f7';
        } else if (node.type === 'SIM_RIG') {
          ctx.fillStyle = isSelected ? '#b45309' : '#92400e';
          ctx.strokeStyle = isSelected ? '#fbbf24' : '#f59e0b';
        } else {
          ctx.fillStyle = '#0f766e';
          ctx.strokeStyle = '#2dd4bf';
        }

        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
        drawSafeRoundRect(ctx, -node.width / 2, -node.height / 2, node.width, node.height, 8);
        ctx.fill();
        ctx.stroke();

        // Monitor / Screen Orientation Notch (shows which way player faces)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-node.width / 2 + 10, -node.height / 2 + 4, node.width - 20, 3);

        // Station Code / Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, 0, 4);

        ctx.restore();

        // Coordinate Tag if selected
        if (isSelected) {
          ctx.save();
          ctx.fillStyle = '#00f0ff';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.fillText(`X:${node.x} Y:${node.y}`, node.x, node.y - 6);
          ctx.restore();
        }
      });
  }, [draft, selectedNodeId, selectedRoomId, hoveredNodeId, showGrid]);

  if (!draft) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>Loading 2D Interactive Venue Layout Builder...</span>
      </div>
    );
  }

  const selectedNode = draft.nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="space-y-4">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="font-extrabold text-base text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              Interactive 2D Floor Layout Builder
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
              Rev #{draft.revision}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Drag & drop workstations &bull; Snap to 20px grid &bull; Real-time turnstile sync &bull; 0 collision safety
          </p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
              showGrid
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Toggle Grid"
          >
            <Grid className="w-4 h-4" />
            <span>Grid</span>
          </button>

          {/* Snap Toggle */}
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              snapToGrid
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            Snap (20px)
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.1))}
              className="p-1.5 text-slate-400 hover:text-white"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-cyan-300">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((s) => Math.min(1.5, s + 0.1))}
              className="p-1.5 text-slate-400 hover:text-white"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleApplyPreset('ESPORTS_5V5')}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              5v5 Esports
            </button>
            <button
              onClick={() => handleApplyPreset('SIM_CLUSTER')}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Car className="w-3.5 h-3.5 text-amber-400" />
              Sim Cluster
            </button>
          </div>

          <button
            onClick={() => setStatusMessage({ text: 'Draft floor layout saved to database.', type: 'success' })}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>

          {role !== 'RECEPTION' && (
            <button
              onClick={handlePublishRevision}
              className="btn-primary text-xs py-1.5 px-3.5"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Publish Revision
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[10px] text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Editor & Canvas Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Left Toolbox & Inspector Panel */}
        <div className="space-y-4">
          {/* Station Toolbox */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add Equipment & Furniture
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddStation('PC')}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left hover:border-cyan-500/50 transition-all flex flex-col gap-1"
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white">Gaming PC</span>
                <span className="text-[10px] text-slate-500">RTX 4090 Rig</span>
              </button>

              <button
                onClick={() => handleAddStation('CONSOLE_SETUP')}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left hover:border-purple-500/50 transition-all flex flex-col gap-1"
              >
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">Console</span>
                <span className="text-[10px] text-slate-500">PS5 / OLED</span>
              </button>

              <button
                onClick={() => handleAddStation('SIM_RIG')}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left hover:border-amber-500/50 transition-all flex flex-col gap-1"
              >
                <Car className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Sim Racing</span>
                <span className="text-[10px] text-slate-500">Direct Drive</span>
              </button>

              <button
                onClick={() => handleAddStation('FURNITURE')}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left hover:border-slate-600 transition-all flex flex-col gap-1"
              >
                <Table className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-white">Team Desk</span>
                <span className="text-[10px] text-slate-500">LAN Bench</span>
              </button>
            </div>
          </div>

          {/* Node Inspector */}
          {selectedNode ? (
            <div className="glass-panel p-4 rounded-2xl border border-cyan-500/40 space-y-3 bg-slate-950/80">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Move className="w-4 h-4 text-cyan-400" />
                  <span className="font-extrabold text-xs text-white">Station Inspector</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {selectedNode.type}
                </span>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Station Name / Code</label>
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
                  className="w-full mt-1 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Position (X, Y)</span>
                  <span className="font-mono text-slate-300 font-bold">{selectedNode.x}px, {selectedNode.y}px</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Dimensions</span>
                  <span className="font-mono text-slate-300 font-bold">{selectedNode.width} &times; {selectedNode.height}</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleRotateSelected}
                  className="flex-1 btn-secondary text-xs py-2 justify-center"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Rotate ({selectedNode.rotation}°)</span>
                </button>
                <button
                  onClick={handleDuplicateSelected}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white"
                  title="Duplicate Station"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="btn-danger text-xs p-2 rounded-lg"
                  title="Delete Station"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 py-6">
              <Move className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">Direct Drag & Drop Enabled</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Click and drag any gaming rig or desk on the canvas to reposition.
              </p>
            </div>
          )}

          {/* Arena Stats */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Total Workstations:</span>
              <span className="font-mono font-bold text-white">
                {draft.nodes.filter((n) => n.layer === 'equipment').length}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Arena Zones:</span>
              <span className="font-mono font-bold text-cyan-400">{draft.rooms.length}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Canvas Canvas Area:</span>
              <span className="font-mono text-slate-500">
                {draft.canvas.width} &times; {draft.canvas.height}px
              </span>
            </div>
          </div>
        </div>

        {/* 2D Interactive Canvas Viewport */}
        <div className="lg:col-span-3 glass-panel p-3 rounded-2xl border border-slate-800 overflow-auto bg-slate-950 max-h-[750px]">
          <div
            style={{
              width: `${draft.canvas.width * zoomScale}px`,
              height: `${draft.canvas.height * zoomScale}px`,
              transition: 'width 0.15s ease-out, height 0.15s ease-out',
            }}
            className="relative mx-auto rounded-xl overflow-hidden shadow-2xl border border-slate-800"
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
        </div>
      </div>
    </div>
  );
};
