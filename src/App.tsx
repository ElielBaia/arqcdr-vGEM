/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, Maximize, FileText, Layers, Share2, Download, 
  Settings, Hexagon, Component, Activity, MessageSquare, 
  FolderOpen, Plus, Play, ChevronRight, CheckCircle2, CircleAlert, LayoutTemplate,
  Cloud, LogIn
} from 'lucide-react';
import { motion } from 'motion/react';
import { GeometryEngine } from './lib/geometry_engine/svg_builder';
import { ElevationBuilder } from './lib/geometry_engine/elevation_builder';
import { TopoGraphBuilder } from './lib/geometry_engine/svg_graph_builder';
import { PBIMProject } from './lib/pbim/schema';
import { ThreeDViewer } from './components/ThreeDViewer';
import { InteractivePlanEditor } from './components/InteractivePlanEditor';
import { TechnicalSheet } from './components/TechnicalSheet';
import { TakeoffPanel } from './components/TakeoffPanel';
import { auth, googleProvider } from './lib/firebase/config';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { savePBIMProject } from './lib/firebase/db';

// --- MOCK DATA FOR FALLBACK ---
const semanticLayers = [
  { id: 'geo', name: 'Geometry', status: 'active' },
  { id: 'sem', name: 'Semantic', status: 'active' },
  { id: 'prog', name: 'Program', status: 'active' },
  { id: 'topo', name: 'Topology', status: 'pending' },
];

// --- COMPONENTS ---

const IconButton = ({ icon: Icon, active, onClick, title }: any) => (
  <button 
    onClick={onClick}
    title={title}
    className={`p-2 border border-black hover:bg-black hover:text-white transition-colors 
      ${active ? 'bg-black text-white' : 'bg-transparent text-black'}`}
  >
    <Icon size={16} strokeWidth={1.5} />
  </button>
);

const PanelHeader = ({ title }: { title: string }) => (
  <div className="flex items-center justify-between border-b border-black p-3 bg-[#f0f0f0]">
    <h2 className="font-mono text-xs uppercase tracking-widest font-semibold">{title}</h2>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('qto'); // qto, pbim, exports
  const [prompt, setPrompt] = useState('Residência brutalista tropical em lote inclinado com pátio interno, iluminação zenital e separação clara entre espaços públicos e íntimos.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState('svg_plan'); // svg_plan, 3d, graph, facade_view, sheet
  const [project, setProject] = useState<PBIMProject | null>(null);
  const [svgStr, setSvgStr] = useState<string>('');
  const [svgFacadeStr, setSvgFacadeStr] = useState<string>('');
  const [svgGraphStr, setSvgGraphStr] = useState<string>('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [actionPrompt, setActionPrompt] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [actionAlert, setActionAlert] = useState<any>(null);
  const [critics, setCritics] = useState<any[]>([]);
  const [isCriticizing, setIsCriticizing] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveToCloud = async () => {
    if (!project || !user) return;
    try {
      await savePBIMProject(project);
      setActionAlert({ explanation: "Projeto salvo na base de dados (Firebase)." });
    } catch (e) {
      console.error(e);
      setActionAlert({ explanation: "Erro ao salvar na nuvem." });
    }
  };

  useEffect(() => {
    fetch('/api/projects/sample/model')
      .then(r => r.json())
      .then((data: PBIMProject) => {
        setProject(data);
      })
      .catch(e => console.error("Error fetching PBIM", e));
  }, []);

  useEffect(() => {
    if (project && viewMode === 'facade_view') {
      const eBuilder = new ElevationBuilder(project);
      setSvgFacadeStr(eBuilder.generateFrontElevationSVG());
    }

    if (project && viewMode === 'sheet') {
      const gEngine = new GeometryEngine(project);
      setSvgStr(gEngine.generateSVGPlan('level_terreo', selectedObjectId));
      const eBuilder = new ElevationBuilder(project);
      setSvgFacadeStr(eBuilder.generateFrontElevationSVG());
    }

    if (project && viewMode === 'graph') {
      const topoBuilder = new TopoGraphBuilder(project);
      setSvgGraphStr(topoBuilder.generateGraphSVG('level_terreo'));
    }

    if (project && project.walls && project.walls.length > 0) {
      if (!isGenerating) {
        setIsCriticizing(true);
        fetch('/api/projects/critic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project })
        })
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setCritics(data);
          setIsCriticizing(false);
        })
        .catch(e => {
          console.error(e);
          setIsCriticizing(false);
        });
      }
    }
  }, [project, viewMode, selectedObjectId, isGenerating]);

  const handleGenerate = () => {
    setIsGenerating(true);
    fetch('/api/projects/from-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
      .then(r => r.json())
      .then(data => {
        setProject(data);
        setIsGenerating(false);
      })
      .catch(e => {
        console.error(e);
        setIsGenerating(false);
      });
  };

  const handleAction = () => {
    if (!actionPrompt || !selectedObjectId || !project) return;
    setIsActing(true);
    setActionAlert(null);
    fetch('/api/projects/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: actionPrompt, targetId: selectedObjectId, currentProject: project })
    })
      .then(r => r.json())
      .then(data => {
        setActionAlert(data.actionAlert);
        if (data.updatedModel) {
          setProject(data.updatedModel);
        }
        setIsActing(false);
        setActionPrompt('');
      })
      .catch(e => {
        console.error(e);
        setIsActing(false);
      });
  };

  const handleSvgClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('pbim-object')) {
      const id = target.getAttribute('data-id');
      if (id) {
        setSelectedObjectId(id);
        setActiveTab('pbim');
      }
    } else {
      setSelectedObjectId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#e8e8e8] overflow-hidden text-[#141414]">
      {/* TOPBAR */}
      <header className="flex items-center justify-between border-b border-black bg-white h-12 shrink-0 px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Hexagon size={18} fill="currentColor" />
            <h1 className="font-serif font-bold text-lg tracking-tight">ARQCdR</h1>
          </div>
          <div className="h-full py-2">
            <div className="w-px h-full bg-black/20" />
          </div>
          <span className="font-mono text-xs text-black/60 uppercase tracking-widest">
            Condenser AI /// Semantic BIM
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {user ? (
            <button 
              onClick={handleSaveToCloud}
              className="flex items-center gap-1 font-mono text-[10px] uppercase bg-black text-white px-2 py-1 hover:bg-black/80 transition-colors"
            >
              <Cloud size={12} /> Save to DB
            </button>
          ) : (
             <button 
              onClick={handleLogin}
              className="flex items-center gap-1 font-mono text-[10px] uppercase bg-black text-white px-2 py-1 hover:bg-black/80 transition-colors"
            >
              <LogIn size={12} /> Login to DB
            </button>
          )}

          <span className="font-mono text-[10px] uppercase bg-black/10 text-black px-2 py-1">
            Status: Engine Online
          </span>
          <button className="flex items-center gap-2 font-mono text-xs uppercase hover:underline">
            <FolderOpen size={14} /> Projects
          </button>
        </div>
      </header>

      {/* WORKSPACE */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL - AI Briefing & Semantic Engine */}
        <aside className="w-80 flex flex-col border-r border-black bg-white shrink-0">
          <PanelHeader title="Semantic Engine" />
          
          <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] uppercase text-black/60">Architectural Prompt</label>
              <textarea 
                className="w-full h-32 p-3 font-serif text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black resize-none bg-[#fafafa]"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter spatial intent..."
              />
              <button 
                onClick={handleGenerate}
                className="flex items-center justify-center gap-2 w-full py-2 bg-black text-white font-mono text-xs uppercase hover:bg-black/80 transition-colors"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <Activity size={14} />
                  </motion.div>
                ) : (
                  <><Play size={14} fill="currentColor" /> Generate Intent</>
                )}
              </button>
            </div>

            <div className="w-full h-px bg-black/20 my-2" />

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase text-black/60">Semantic Parsing</span>
              <div className="flex flex-col gap-1">
                {['Brutalism', 'Tropical', 'Sloped Site', 'Courtyard', 'Public/Private Split'].map((tag, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs border border-black/10 px-2 py-1 bg-black/5">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span className="font-mono">{tag}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-black/20 my-2" />

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase text-black/60">Critic Agent</span>
              {isCriticizing && (
                <div className="p-3 border border-black/10 bg-black/5 text-black/60 text-xs font-serif leading-relaxed animate-pulse">
                  Analyzing spatial logic...
                </div>
              )}
              {!isCriticizing && critics.length === 0 && (
                <div className="p-3 border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-serif leading-relaxed">
                  No critical issues found.
                </div>
              )}
              {!isCriticizing && critics.map((critic, idx) => (
                <div key={idx} className={`p-3 border text-xs font-serif leading-relaxed ${
                  critic.severity === 'critical' ? 'border-red-300 bg-red-50 text-red-900' :
                  critic.severity === 'warning' ? 'border-orange-300 bg-orange-50 text-orange-900' :
                  'border-blue-300 bg-blue-50 text-blue-900'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CircleAlert size={14} />
                    <span className="font-bold">{critic.title}</span>
                  </div>
                  <div className="mb-2 uppercase text-[9px] font-mono opacity-70 tracking-widest">{critic.axis} axis</div>
                  {critic.message}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER PANEL - Canvas */}
        <section className="flex-1 flex flex-col relative bg-[#f4f4f4]">
          {/* Canvas Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex gap-1">
            <IconButton icon={Box} title="3D Massing" active={viewMode === '3d'} onClick={() => setViewMode('3d')} />
            <IconButton icon={Maximize} title="Schematic Plan" active={viewMode === 'svg_plan'} onClick={() => setViewMode('svg_plan')} />
            <IconButton icon={Activity} title="Elevation View" active={viewMode === 'facade_view'} onClick={() => setViewMode('facade_view')} />
            <IconButton icon={LayoutTemplate} title="Technical Sheet" active={viewMode === 'sheet'} onClick={() => setViewMode('sheet')} />
          </div>
          
          <div className="absolute top-4 right-4 z-10 font-mono text-[10px] uppercase bg-white border border-black px-2 py-1">
            {viewMode === 'svg_plan' ? 'SVG // LVL 00' : viewMode === '3d' ? 'OBJ // Monochromatic' : viewMode === 'sheet' ? 'SHEET // A1 PREVIEW' : 'SVG // FRONT ELEVATION'}
          </div>

          {/* Canvas Area Mock */}
          <div className="w-full h-full flex items-center justify-center p-12 overflow-auto" 
               style={{ 
                 backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', 
                 backgroundSize: '20px 20px',
                 backgroundPosition: '-10px -10px'
               }}>
            
            {viewMode === 'svg_plan' && project && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full shadow-2xl relative border-[2px] border-black bg-white/80"
              >
                <InteractivePlanEditor 
                   project={project} 
                   levelId="level_terreo" 
                   onUpdateProject={setProject} 
                   selectedObjectId={selectedObjectId}
                   onSelectObject={setSelectedObjectId}
                />
              </motion.div>
            )}

            {viewMode === 'sheet' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full max-w-6xl flex items-center justify-center pt-8 pb-8"
              >
                <TechnicalSheet project={project} svgPlanStr={svgStr} svgFacadeStr={svgFacadeStr} />
              </motion.div>
            )}

            {viewMode === 'facade_view' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-4xl aspect-[4/3] border-[2px] border-black bg-white/80 p-8 shadow-2xl flex flex-col items-center justify-center"
              >
                {svgFacadeStr ? (
                  <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svgFacadeStr }} />
                ) : (
                  <div className="font-mono text-xs opacity-50">Generating Elevation...</div>
                )}
                
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">Vista Técnica</span>
                  Fachada Frontal
                </div>
              </motion.div>
            )}

            {viewMode === 'graph' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-4xl aspect-[4/3] border-[2px] border-black bg-white/80 p-8 shadow-2xl flex flex-col items-center justify-center"
              >
                {svgGraphStr ? (
                  <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svgGraphStr }} />
                ) : (
                  <div className="font-mono text-xs opacity-50">Generating Topo Graph...</div>
                )}
                
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">Analysis</span>
                  Topological Adjacency Diagram
                </div>
              </motion.div>
            )}

            {viewMode === '3d' && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="w-full h-full border-[2px] border-black bg-white/80 shadow-2xl relative"
              >
                {project ? (
                  <ThreeDViewer 
                    project={project} 
                    selectedObjectId={selectedObjectId} 
                    onSelect={(id) => {
                      setSelectedObjectId(id);
                      if (id) setActiveTab('pbim');
                    }} 
                  />
                ) : (
                  <div className="flex items-center justify-center font-mono text-sm h-full opacity-50">
                    Loading 3D Engine...
                  </div>
                )}
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60 pointer-events-none">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">WebGL Active</span>
                  {project?.name || 'Loading Model...'}
                </div>
              </motion.div>
            )}

          </div>
        </section>

        {/* RIGHT PANEL - Documentation & BIM */}
        <aside className="w-80 flex flex-col border-l border-black bg-white shrink-0">
          <div className="flex border-b border-black">
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase ${activeTab === 'pbim' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('pbim')}
            >
              PBIM
            </button>
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase border-l border-black ${activeTab === 'qto' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('qto')}
            >
              QTO Data
            </button>
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase border-l border-black ${activeTab === 'exports' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('exports')}
            >
              Exports
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-0">
            {activeTab === 'pbim' && (
              <div className="flex flex-col">
                <div className="font-mono text-[10px] p-2 bg-[#f0f0f0] border-b border-black text-black/60 uppercase">Connected Model Entities</div>
                {project ? (
                  <>
                    <div className="flex items-center justify-between p-2 border-b border-black/10 hover:bg-black/5 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Component size={12} className="text-black/40" />
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold">Project</span>
                          <span className="font-serif text-[10px] text-black/60 italic">{project.name}</span>
                        </div>
                      </div>
                    </div>
                    {project.site && (
      <div className="flex items-center justify-between p-2 border-b border-black/10 hover:bg-black/5 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-full flex justify-center"><div className="w-px h-full bg-black/20" /></div>
                        <Component size={12} className="text-black/40" />
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold">Site</span>
                          <span className="font-serif text-[10px] text-black/60 italic">{project.site.front_width}x{project.site.depth}m</span>
                        </div>
                      </div>
                    </div>
                    )}
                    {project.spaces.map(s => (
      <div key={s.id} className={`flex items-center justify-between p-2 border-b border-black/10 hover:bg-black/5 cursor-pointer ${selectedObjectId === s.id ? 'bg-black/10 shadow-inner' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-full flex justify-center"><div className="w-px h-full bg-black/20" /></div>
                        <Component size={12} className={selectedObjectId === s.id ? 'text-black' : 'text-black/40'} />
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold">Space</span>
                          <span className="font-serif text-[10px] text-black/60 italic">{s.name} ({s.category})</span>
                        </div>
                      </div>
                      {s.area_target && <span className="font-mono text-[10px] bg-black/5 px-1">{s.area_target}m²</span>}
                    </div>
                    ))}
                    {project.walls.map(w => (
      <div key={w.id} className={`flex items-center justify-between p-2 border-b border-black/10 hover:bg-black/5 cursor-pointer ${selectedObjectId === w.id ? 'bg-black/10 shadow-inner' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-full flex justify-center"><div className="w-px h-full bg-black/20" /></div>
                        <Component size={12} className={selectedObjectId === w.id ? 'text-black' : 'text-black/40'} />
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold">Wall</span>
                          <span className="font-serif text-[10px] text-black/60 italic">{Number(w.thickness).toFixed(2)}m Thk</span>
                        </div>
                      </div>
                    </div>
                    ))}
                  </>
                ) : (
                  <div className="p-4 font-mono text-[10px] opacity-50">No PBIM Object Loaded</div>
                )}
              </div>
            )}

            {activeTab === 'pbim' && (
              <div className="p-4 flex flex-col gap-3 border-t border-black bg-[#fafafa]">
                <span className="font-mono text-[10px] uppercase text-black/60">Reborn / AI Editor</span>
                <div className="flex flex-col gap-2">
                  <textarea 
                    className="w-full p-2 font-mono text-xs border border-black focus:outline-none focus:ring-1 focus:ring-black resize-none bg-white placeholder:text-black/30"
                    placeholder="e.g. Ampliar o salão principal em 2m, adicionar janela na fachada norte..."
                    rows={4}
                    value={actionPrompt}
                    onChange={e => setActionPrompt(e.target.value)}
                  />
                  <button 
                    disabled={isActing}
                    onClick={handleAction}
                    className="flex items-center justify-center gap-2 w-full py-1.5 bg-black text-white font-mono text-xs uppercase hover:bg-black/80 transition-colors"
                  >
                    {isActing ? 'Mutating PBIM...' : 'Request Change'}
                  </button>
                  {actionAlert && (
                     <div className="mt-2 p-2 font-serif text-xs border border-black/20 bg-emerald-50 text-emerald-900 shadow-sm leading-tight">
                       <span className="font-bold flex items-center gap-1 mb-1"><CheckCircle2 size={12} /> Operation Validated:</span>
                       {actionAlert.explanation}
                     </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'qto' && (
              <TakeoffPanel project={project} />
            )}

            {activeTab === 'exports' && (
              <div className="p-4 flex flex-col gap-2">
                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!svgStr) return;
                     const blob = new Blob([svgStr], {type: "image/svg+xml"});
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement("a");
                     a.href = url;
                     a.download = `${project?.name || 'export'}.svg`;
                     a.click();
                  }}
                >
                  <span className="font-mono text-xs uppercase">SVG Vector</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     import('./lib/geometry_engine/dxf_builder').then(({ DXFBuilder }) => {
                       const dxfBuilder = new DXFBuilder(project);
                       const dxfStr = dxfBuilder.generateThickWallsDXF();
                       const blob = new Blob([dxfStr], {type: "text/plain"});
                       const url = URL.createObjectURL(blob);
                       const a = document.createElement("a");
                       a.href = url;
                       a.download = `${project.name || 'export'}.dxf`;
                       a.click();
                     });
                  }}
                >
                  <span className="font-mono text-xs uppercase">DXF CAD</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     const blob = new Blob([JSON.stringify(project, null, 2)], {type: "application/json"});
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement("a");
                     a.href = url;
                     a.download = `${project?.name || 'export'}.pbim.json`;
                     a.click();
                  }}
                >
                  <span className="font-mono text-xs uppercase">PBIM JSON</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     import('./lib/geometry_engine/obj_builder').then(({ OBJBuilder }) => {
                       const objBuilder = new OBJBuilder(project);
                       const objStr = objBuilder.generateOBJ();
                       const blob = new Blob([objStr], {type: "text/plain"});
                       const url = URL.createObjectURL(blob);
                       const a = document.createElement("a");
                       a.href = url;
                       a.download = `${project.name || 'export'}.obj`;
                       a.click();
                     });
                  }}
                >
                  <span className="font-mono text-xs uppercase">OBJ 3D Model</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
