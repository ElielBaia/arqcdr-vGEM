import React, { useMemo } from 'react';
import { PBIMProject } from '../lib/pbim/schema';
import { FileBarChart2 } from 'lucide-react';

export const TakeoffPanel: React.FC<{ project: PBIMProject | null }> = ({ project }) => {
  const takeoff = useMemo(() => {
    if (!project) return null;

    let totalArea = 0;
    let totalWallVolume = 0;
    let totalWallLen = 0;
    
    project.spaces.forEach(s => totalArea += (s.area_actual || 0));
    
    project.walls.forEach(w => {
      const dx = w.end[0] - w.start[0];
      const dy = w.end[1] - w.start[1];
      const len = Math.hypot(dx, dy);
      totalWallLen += len;
      totalWallVolume += len * w.thickness * w.height;
    });

    const openingsCount = project.openings.length;
    const doorsCount = project.openings.filter(o => o.type === 'Door').length;
    const windowsCount = project.openings.filter(o => o.type === 'Window').length;

    return {
      totalArea: totalArea.toFixed(2),
      totalWallLen: totalWallLen.toFixed(2),
      totalWallVolume: totalWallVolume.toFixed(2),
      openingsCount, doorsCount, windowsCount,
      wallCount: project.walls.length,
      spaceCount: project.spaces.length,
    }
  }, [project]);

  if (!project || !takeoff) {
    return <div className="p-4 font-mono text-[10px] opacity-50">No Data Available</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      <div className="p-3 border-b border-black flex items-center gap-2 bg-emerald-50 text-emerald-900">
        <FileBarChart2 size={16} />
        <span className="font-mono text-xs font-bold uppercase">BIM Quantity Takeoff (QTO)</span>
      </div>
      <div className="p-4 flex flex-col gap-6 overflow-y-auto pb-20">
        
        <div>
          <div className="text-[10px] font-mono uppercase text-black/50 mb-2">Metrics Summary</div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">GFA (spaces target)</span>
              <span className="font-mono text-sm">{takeoff.totalArea} m²</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Rooms / Spaces</span>
              <span className="font-mono text-sm">{takeoff.spaceCount} units</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Levels</span>
              <span className="font-mono text-sm">{project.levels.length} lvl</span>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase text-black/50 mb-2">Structural & Enclosure</div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Total Walls</span>
              <span className="font-mono text-sm">{takeoff.wallCount}</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Linear Wall Length</span>
              <span className="font-mono text-sm">{takeoff.totalWallLen} m</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Wall Concrete/Masonry Vol.</span>
              <span className="font-mono text-sm">{takeoff.totalWallVolume} m³</span>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase text-black/50 mb-2">Openings / Frames</div>
           <div className="flex flex-col gap-2">
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm">Total Count</span>
              <span className="font-mono text-sm">{takeoff.openingsCount}</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm pl-4 leading-tight">▸ Doors</span>
              <span className="font-mono text-sm">{takeoff.doorsCount} units</span>
            </div>
            <div className="flex justify-between border-b border-black/10 pb-1">
              <span className="font-serif text-sm pl-4 leading-tight">▸ Windows</span>
              <span className="font-mono text-sm">{takeoff.windowsCount} units</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
