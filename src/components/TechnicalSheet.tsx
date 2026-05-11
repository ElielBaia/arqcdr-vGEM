import React from 'react';
import { PBIMProject } from '../lib/pbim/schema';

interface TechnicalSheetProps {
  project: PBIMProject | null;
  svgPlanStr: string;
  svgFacadeStr: string;
}

export const TechnicalSheet: React.FC<TechnicalSheetProps> = ({ project, svgPlanStr, svgFacadeStr }) => {
  if (!project) return null;

  return (
    <div className="w-full aspect-[1.414/1] bg-white border-[2px] border-black p-4 flex flex-col relative font-mono text-black shadow-2xl">
      {/* Outer Border */}
      <div className="border-[2px] border-black flex-1 flex flex-row relative">
        
        {/* Drawings Area */}
        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="flex-1 border border-black/20 p-2 relative bg-[#fcfcfc]">
             <div className="absolute top-2 left-2 text-[10px] uppercase font-bold text-black/60">Planta Baixa - Nível Térreo</div>
             <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgPlanStr }} />
          </div>
          <div className="flex-1 border border-black/20 p-2 relative bg-[#fcfcfc]">
             <div className="absolute top-2 left-2 text-[10px] uppercase font-bold text-black/60">Fachada Frontal</div>
             <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgFacadeStr }} />
          </div>
        </div>

        {/* Title Block (Carimbo) Right Side */}
        <div className="w-48 xl:w-56 border-l-[2px] border-black flex flex-col">
          <div className="flex-1 relative">
            <div className="absolute bottom-2 right-2 opacity-10 text-[64px] font-black tracking-tighter leading-none">
              arq<br/>AI
            </div>
          </div> 
          
          <div className="border-t-[2px] border-black flex flex-col bg-white z-10">
             <div className="p-3 border-b-[2px] border-black">
               <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Projeto</div>
               <div className="text-sm font-bold leading-tight">{project.name || 'Residência Sem Nome'}</div>
             </div>
             
             <div className="p-3 border-b-[2px] border-black">
               <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Conteúdo</div>
               <div className="text-xs">Estudo Preliminar<br/>Plantas e Fachadas Ortográficas</div>
             </div>
             
             <div className="p-3 border-b-[2px] border-black relative">
               <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Autor / Arquiteto</div>
               <div className="text-xs">AI Studio Architect</div>
               <div className="mt-2 h-6 border-b border-dashed border-black/30"></div>
               <div className="text-[8px] text-black/40 mt-1 text-right italic">Assinatura</div>
             </div>

             <div className="p-3 border-b-[2px] border-black">
               <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Revisão</div>
               <div className="text-xs">R00 - Emissão Inicial</div>
             </div>
             
             <div className="flex flex-row">
               <div className="p-3 border-r-[2px] border-black flex-1">
                 <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Data</div>
                 <div className="text-xs">{(new Date()).toLocaleDateString('pt-BR')}</div>
               </div>
               <div className="p-3 flex-1">
                 <div className="text-[9px] uppercase text-black/50 font-bold mb-1">Escala</div>
                 <div className="text-xs">Indicada</div>
               </div>
             </div>
             
             <div className="p-4 border-t-[2px] border-black bg-black text-white flex justify-between items-end">
               <div className="text-[10px] uppercase font-bold tracking-widest text-[#aaddff]">Prancha</div>
               <div className="text-3xl font-black leading-none">A01</div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
