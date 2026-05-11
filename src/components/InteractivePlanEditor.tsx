import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { PBIMProject, PBIMWall, PBIMSpace, PBIMOpening } from '../lib/pbim/schema';
import { MousePointer2, Move, Crosshair, HelpCircle, Grip, Undo2, Maximize } from 'lucide-react';

interface Point2D { x: number; y: number; }
interface TopoNode {
    id: string;
    x: number;
    y: number;
    refs: { wallId: string; endpoint: 'start' | 'end' }[];
}

interface EditorProps {
    project: PBIMProject;
    levelId: string;
    onUpdateProject: (p: PBIMProject) => void;
    selectedObjectId?: string | null;
    onSelectObject?: (id: string | null) => void;
}

// Helpers
const distance = (p1: Point2D, p2: Point2D) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const calcPolyArea = (pts: Point2D[]) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        let j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y;
        area -= pts[i].y * pts[j].x;
    }
    return Math.abs(area / 2);
}

export const InteractivePlanEditor: React.FC<EditorProps> = ({ project, levelId, onUpdateProject, selectedObjectId, onSelectObject }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Viewport State
    const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 40 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPos, setLastPanPos] = useState<Point2D | null>(null);

    // Interaction State
    const [dragState, setDragState] = useState<{
        type: 'node' | 'wall' | 'none';
        id?: string;
        startMouse?: Point2D;
        originalNodes?: TopoNode[];
        dragPos?: Point2D;
    }>({ type: 'none' });
    
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredWall, setHoveredWall] = useState<string | null>(null);
    const [snaps, setSnaps] = useState<{x?: number, y?: number}>({});

    // Build Topology
    const topoNodes = useMemo(() => {
        const nodes: TopoNode[] = [];
        const TOL = 0.1;
        project.walls.forEach(w => {
            if (w.level_id !== levelId) return;
            (['start', 'end'] as const).forEach(endpoint => {
                const pt = endpoint === 'start' ? w.start : w.end;
                let n = nodes.find(existing => Math.hypot(existing.x - pt[0], existing.y - pt[1]) < TOL);
                if (!n) {
                    n = { id: `node_${pt[0].toFixed(2)}_${pt[1].toFixed(2)}_${Math.random().toString(36).substr(2,4)}`, x: pt[0], y: pt[1], refs: [] };
                    nodes.push(n);
                }
                n.refs.push({ wallId: w.id, endpoint });
            });
        });
        return nodes;
    }, [project, levelId]);

    // Screen to World Transform
    const screenToWorld = useCallback((clientX: number, clientY: number): Point2D => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const x = (clientX - rect.left - rect.width / 2 - camera.x) / camera.zoom;
        const y = -(clientY - rect.top - rect.height / 2 - camera.y) / camera.zoom;
        return { x, y };
    }, [camera]);

    // Handlers
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey || true) { // Always zoom on wheel for now
             e.preventDefault();
             const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
             setCamera(c => ({ ...c, zoom: Math.max(5, Math.min(300, c.zoom * scaleFactor)) }));
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 1 || e.button === 2) { // Middle click or right click -> pan
            setIsPanning(true);
            setLastPanPos({ x: e.clientX, y: e.clientY });
            return;
        }

        const worldPt = screenToWorld(e.clientX, e.clientY);

        // Check if clicked a node
        const clickedNode = topoNodes.find(n => distance(n, worldPt) < 0.4);
        if (clickedNode) {
            setDragState({ type: 'node', id: clickedNode.id, startMouse: worldPt, dragPos: { x: clickedNode.x, y: clickedNode.y } });
            (e.target as Element).setPointerCapture(e.pointerId);
            return;
        }

        // Feature: Drag whole wall (requires more complex hit testing, skipping for brevity, handled via clicking wall element directly instead)
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning && lastPanPos) {
            setCamera(c => ({
                ...c,
                x: c.x + (e.clientX - lastPanPos.x),
                y: c.y + (e.clientY - lastPanPos.y)
            }));
            setLastPanPos({ x: e.clientX, y: e.clientY });
            return;
        }

        const worldPt = screenToWorld(e.clientX, e.clientY);

        if (dragState.type === 'node' && dragState.id) {
            // Snapping Logic
            let fx = worldPt.x;
            let fy = worldPt.y;
            let sx, sy;

            const snapNodes = topoNodes.filter(n => n.id !== dragState.id);
            const snapX = snapNodes.find(n => Math.abs(n.x - fx) < 0.2);
            const snapY = snapNodes.find(n => Math.abs(n.y - fy) < 0.2);

            if (snapX) { fx = snapX.x; sx = fx; }
            if (snapY) { fy = snapY.y; sy = fy; }

            // Grid snapping overriding
            if (e.shiftKey) {
                fx = Math.round(fx); fy = Math.round(fy);
            }

            setDragState(prev => ({ ...prev, dragPos: { x: fx, y: fy } }));
            setSnaps({ x: sx, y: sy });
        } else if (dragState.type === 'wall' && dragState.originalNodes) {
            // Drag entire wall
            const dx = worldPt.x - (dragState.startMouse?.x || 0);
            const dy = worldPt.y - (dragState.startMouse?.y || 0);

            let newDragPos = { x: worldPt.x, y: worldPt.y };
            
            // Basic snapping for wall dragging (snap translation vector)
            if (e.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) setDragState(prev => ({...prev, dragPos: { x: worldPt.x, y: dragState.startMouse!.y }}));
                else setDragState(prev => ({...prev, dragPos: { x: dragState.startMouse!.x, y: worldPt.y }}));
            } else {
                 setDragState(prev => ({...prev, dragPos: newDragPos}));
            }
        } else {
            // Hover logic for nodes
            const hovered = topoNodes.find(n => distance(n, worldPt) < 0.4);
            setHoveredNode(hovered ? hovered.id : null);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsPanning(false);
        setLastPanPos(null);

        if (dragState.type !== 'none' && dragState.dragPos) {
            const newProject = JSON.parse(JSON.stringify(project)) as PBIMProject;
            
            if (dragState.type === 'node' && dragState.id) {
                const node = topoNodes.find(n => n.id === dragState.id);
                if (node) {
                    node.refs.forEach(ref => {
                        const w = newProject.walls.find(w => w.id === ref.wallId);
                        if (w) {
                            if (ref.endpoint === 'start') { w.start[0] = dragState.dragPos!.x; w.start[1] = dragState.dragPos!.y; }
                            else { w.end[0] = dragState.dragPos!.x; w.end[1] = dragState.dragPos!.y; }
                        }
                    });
                }
            } else if (dragState.type === 'wall' && dragState.id && dragState.originalNodes && dragState.startMouse) {
                let dx = dragState.dragPos.x - dragState.startMouse.x;
                let dy = dragState.dragPos.y - dragState.startMouse.y;
                
                // apply translation to both nodes connected to this wall
                const wOrig = newProject.walls.find(w => w.id === dragState.id);
                if (wOrig) {
                   wOrig.start[0] += dx; wOrig.start[1] += dy;
                   wOrig.end[0] += dx; wOrig.end[1] += dy;
                   // Wait, if other walls share these nodes, they should stretch!
                   dragState.originalNodes.forEach(node => {
                       node.refs.forEach(ref => {
                           const w = newProject.walls.find(ww => ww.id === ref.wallId);
                           if (w && w.id !== dragState.id) {
                               if (ref.endpoint === 'start') { w.start[0] += dx; w.start[1] += dy; }
                               else { w.end[0] += dx; w.end[1] += dy; }
                           }
                       })
                   });
                }
            }
            
            // Recalculate areas based on new wall geometry
            newProject.spaces.forEach(space => {
               const pts = getPolygonCoords(space, newProject.walls, (wId, type) => {
                   const w = newProject.walls.find(ww => ww.id === wId);
                   return type === 'start' ? {x: w!.start[0], y: w!.start[1]} : {x: w!.end[0], y: w!.end[1]};
               });
               if (pts && pts.length >= 3) {
                   space.area_actual = Number(calcPolyArea(pts).toFixed(2));
               }
            });

            onUpdateProject(newProject);
        }

        setDragState({ type: 'none' });
        setSnaps({});
    };

    const getNodeCoords = useCallback((wallId: string, endpoint: 'start'|'end') => {
        // If we are dragging, supply dynamic coords
        if (dragState.type === 'node' && dragState.id && dragState.dragPos) {
           const n = topoNodes.find(n => n.id === dragState.id);
           if (n && n.refs.some(r => r.wallId === wallId && r.endpoint === endpoint)) return dragState.dragPos;
        } else if (dragState.type === 'wall' && dragState.id && dragState.dragPos && dragState.startMouse && dragState.originalNodes) {
           let dx = dragState.dragPos.x - dragState.startMouse.x;
           let dy = dragState.dragPos.y - dragState.startMouse.y;
           
           const nOrig = dragState.originalNodes.find(n => n.refs.some(r => r.wallId === wallId && r.endpoint === endpoint));
           if (nOrig) { return { x: nOrig.x + dx, y: nOrig.y + dy }; }
        }

        const w = project.walls.find(w => w.id === wallId);
        if (!w) return {x: 0, y: 0};
        return endpoint === 'start' ? {x: w.start[0], y: w.start[1]} : {x: w.end[0], y: w.end[1]};
    }, [project, topoNodes, dragState]);

    // Space Polygon Tracer
    const getPolygonCoords = (space: PBIMSpace, walls: PBIMWall[], getCoords: (wId: string, type: 'start'|'end') => Point2D) => {
        const segments = space.boundary_walls.map(wId => {
            const w = walls.find(w => w.id === wId);
            if (!w) return null;
            return { id: wId, p1: getCoords(wId, 'start'), p2: getCoords(wId, 'end') }
        }).filter(Boolean) as {id: string, p1: Point2D, p2: Point2D}[];

        if (segments.length < 3) return null;

        const points: Point2D[] = [];
        let unvisited = [...segments];
        let current = unvisited.shift()!;
        points.push(current.p1);
        let target = current.p2;

        for (let i=0; i<100; i++) { // safety limit
            points.push(target);
            const idx = unvisited.findIndex(s => Math.hypot(s.p1.x - target.x, s.p1.y - target.y) < 0.1 || Math.hypot(s.p2.x - target.x, s.p2.y - target.y) < 0.1);
            if (idx === -1) break;
            const nextSeg = unvisited[idx];
            unvisited.splice(idx, 1);
            if (Math.hypot(nextSeg.p1.x - target.x, nextSeg.p1.y - target.y) < 0.1) target = nextSeg.p2;
            else target = nextSeg.p1;
            
            if (unvisited.length === 0) break;
        }
        return points;
    };

    return (
        <div className="relative w-full h-full bg-[#f8f9fa] overflow-hidden select-none outline-none touch-none" 
             ref={containerRef}
             onWheel={handleWheel}
             onPointerDown={handlePointerDown}
             onPointerMove={handlePointerMove}
             onPointerUp={handlePointerUp}
             onPointerLeave={handlePointerUp}
             onContextMenu={(e) => e.preventDefault()}
             style={{ cursor: isPanning ? 'grabbing' : dragState.type !== 'none' ? 'grabbing' : 'crosshair' }}
        >
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="flex bg-white border border-black shadow-sm font-mono text-[10px] items-center px-3 py-1.5 uppercase font-bold text-black/70">
                    <Crosshair className="w-3 h-3 mr-2" />
                    Interactive Blueprint Engine
                </div>
                <button className="bg-white border border-black p-1.5 hover:bg-black hover:text-white transition-colors" onClick={() => setCamera({x:0, y:0, zoom: 40})} title="Reset View">
                    <Maximize className="w-4 h-4" />
                </button>
            </div>

            <div className="absolute bottom-4 left-4 z-10 flex flex-col pointer-events-none font-mono text-[10px] text-black/50">
               <span>Drag nodes to reshape. Shift to lock axis.</span>
               <span>Middle mouse / Right click to pan. Scroll to zoom.</span>
            </div>

            <svg className="w-full h-full pointer-events-none">
                {/* Viewport Transform Group */}
                {containerRef.current && (
                    <g transform={`translate(${containerRef.current.clientWidth/2 + camera.x}, ${containerRef.current.clientHeight/2 + camera.y}) scale(${camera.zoom}, ${-camera.zoom})`}>
                        
                        {/* Grid */}
                        <g opacity={0.1}>
                           {Array.from({length: 41}).map((_, i) => (
                             <g key={i}>
                               <line x1={-20} y1={-20 + i} x2={20} y2={-20 + i} stroke="black" strokeWidth={0.02} />
                               <line x1={-20 + i} y1={-20} x2={-20 + i} y2={20} stroke="black" strokeWidth={0.02} />
                             </g>
                           ))}
                        </g>

                        {/* Spaces */}
                        {project.spaces.filter(s => s.level_id === levelId).map(space => {
                            const pts = getPolygonCoords(space, project.walls, getNodeCoords);
                            const isSelected = selectedObjectId === space.id;
                            
                            let fill = 'rgba(230, 230, 230, 0.4)';
                            if (space.category?.toLowerCase() === 'social') fill = 'rgba(255, 230, 200, 0.5)';
                            else if (space.category?.toLowerCase() === 'intimate' || space.category?.toLowerCase() === 'intimo') fill = 'rgba(200, 220, 255, 0.5)';
                            else if (space.category?.toLowerCase() === 'service' || space.category?.toLowerCase() === 'servico') fill = 'rgba(220, 255, 220, 0.5)';

                            if (!pts || pts.length < 3) return null;

                            // Calculate center of polygon for text
                            let cx = 0, cy = 0;
                            pts.forEach(p => { cx += p.x; cy += p.y; });
                            cx /= pts.length;
                            cy /= pts.length;

                            return (
                                <g key={space.id}>
                                    <polygon 
                                        points={pts.map(p => `${p.x},${p.y}`).join(' ')} 
                                        fill={isSelected ? 'rgba(255, 0, 0, 0.1)' : fill}
                                        stroke={isSelected ? '#f00' : 'none'}
                                        strokeWidth={0.05}
                                        className="pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity"
                                        onPointerDown={(e) => { e.stopPropagation(); onSelectObject?.(space.id); }}
                                    />
                                    <text x={0} y={0} transform={`translate(${cx}, ${cy}) scale(1, -1)`} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontSize={0.4} fontWeight={isSelected ? 'bold' : 'normal'} fill={isSelected ? '#f00' : '#141414'} opacity={0.8} pointerEvents="none">
                                        {space.name}
                                    </text>
                                    <text x={0} y={0} transform={`translate(${cx}, ${cy - 0.5}) scale(1, -1)`} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontSize={0.25} fill={isSelected ? '#f00' : '#141414'} opacity={0.6} pointerEvents="none">
                                        {space.area_actual} m²
                                    </text>
                                </g>
                            )
                        })}

                        {/* Walls */}
                        {project.walls.filter(w => w.level_id === levelId).map(wall => {
                            const p1 = getNodeCoords(wall.id, 'start');
                            const p2 = getNodeCoords(wall.id, 'end');
                            const isSelected = selectedObjectId === wall.id;
                            
                            const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                            const length = Math.hypot(dx, dy);
                            
                            return (
                                <g key={wall.id} className="pointer-events-auto" 
                                   onPointerEnter={() => setHoveredWall(wall.id)}
                                   onPointerLeave={() => setHoveredWall(null)}
                                   onPointerDown={(e) => {
                                       e.stopPropagation();
                                       onSelectObject?.(wall.id);
                                       if (e.button === 0) {
                                           // Setup Wall Drag
                                           const worldPt = screenToWorld(e.clientX, e.clientY);
                                           const nodesLinked = topoNodes.filter(n => n.refs.some(r => r.wallId === wall.id));
                                           setDragState({ type: 'wall', id: wall.id, startMouse: worldPt, dragPos: worldPt, originalNodes: nodesLinked });
                                           (e.target as Element).setPointerCapture(e.pointerId);
                                       }
                                   }}
                                >
                                    {/* Invisible hit area */}
                                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={0.8} style={{cursor: 'move'}} />
                                    
                                    {/* Real Wall */}
                                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                                          stroke={isSelected ? '#ff0000' : hoveredWall === wall.id ? '#666' : '#141414'} 
                                          strokeWidth={wall.thickness} 
                                          strokeLinecap="square" />
                                          
                                    {/* Wall Dimension Text (Hover or Drag) */}
                                    {(hoveredWall === wall.id || dragState.id === wall.id || isSelected) && (
                                        <text x={0} y={0} transform={`translate(${(p1.x+p2.x)/2}, ${(p1.y+p2.y)/2 + 0.3}) scale(1, -1)`} textAnchor="middle" fontFamily="monospace" fontSize={0.25} fill="#f00" pointerEvents="none" stroke="white" strokeWidth={0.05} paintOrder="stroke">
                                            {length.toFixed(2)}m
                                        </text>
                                    )}
                                </g>
                            )
                        })}

                        {/* Openings */}
                        {project.openings.map(op => {
                            const w = project.walls.find(ww => ww.id === op.wall_id);
                            if (!w || w.level_id !== levelId) return null;
                            const p1 = getNodeCoords(w.id, 'start');
                            const p2 = getNodeCoords(w.id, 'end');
                            
                            const opCx = p1.x + (p2.x - p1.x) * op.position_t;
                            const opCy = p1.y + (p2.y - p1.y) * op.position_t;
                            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                            
                            return (
                                <g key={op.id} transform={`translate(${opCx}, ${opCy}) rotate(${angle * 180 / Math.PI})`} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); onSelectObject?.(op.id); }}>
                                    <rect x={-op.width/2} y={-w.thickness/2 - 0.05} width={op.width} height={w.thickness + 0.1} fill={op.type === 'Window' ? '#aaddff' : '#fff'} stroke="#141414" strokeWidth={0.03} />
                                    {op.type === 'Door' && (
                                        <g>
                                          {/* Simple Door Arc */}
                                          <line x1={-op.width/2} y1={w.thickness/2} x2={-op.width/2} y2={w.thickness/2 + op.width} stroke="#141414" strokeWidth={0.02} />
                                          <path d={`M ${-op.width/2} ${w.thickness/2 + op.width} A ${op.width} ${op.width} 0 0 1 ${op.width/2} ${w.thickness/2}`} fill="none" stroke="#141414" strokeWidth={0.02} strokeDasharray="0.05 0.05"/>
                                        </g>
                                    )}
                                </g>
                            )
                        })}

                        {/* Nodes */}
                        {topoNodes.map(node => {
                            let nx = node.x; let ny = node.y;
                            if (dragState.type === 'node' && dragState.id === node.id && dragState.dragPos) { nx = dragState.dragPos.x; ny = dragState.dragPos.y; }
                            else if (dragState.type === 'wall' && dragState.originalNodes?.find(n => n.id === node.id) && dragState.dragPos && dragState.startMouse) {
                                nx += dragState.dragPos.x - dragState.startMouse.x;
                                ny += dragState.dragPos.y - dragState.startMouse.y;
                            }

                            const isHovered = hoveredNode === node.id || (dragState.type === 'node' && dragState.id === node.id);
                            
                            return (
                                <circle 
                                    key={node.id} 
                                    cx={nx} cy={ny} 
                                    r={isHovered ? 0.3 / (camera.zoom/40) : 0.1 / (camera.zoom/40)} 
                                    fill={isHovered ? '#ff0000' : '#141414'} 
                                    stroke="#fff" strokeWidth={0.05} 
                                    className="pointer-events-none transition-all"
                                />
                            )
                        })}

                        {/* Snap Guides */}
                        {snaps.x !== undefined && <line x1={snaps.x} y1={-100} x2={snaps.x} y2={100} stroke="#00ffff" strokeWidth={0.02} strokeDasharray="0.1 0.1" pointerEvents="none" />}
                        {snaps.y !== undefined && <line x1={-100} y1={snaps.y} x2={100} y2={snaps.y} stroke="#ff00ff" strokeWidth={0.02} strokeDasharray="0.1 0.1" pointerEvents="none" />}

                    </g>
                )}
            </svg>
        </div>
    );
}
