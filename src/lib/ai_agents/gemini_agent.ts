import { GoogleGenAI, Type, Schema } from '@google/genai';
import { PBIMProject } from '../pbim/schema';

// We use the environment variable provided by AI Studio
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const pbimSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    project_id: { type: Type.STRING },
    schema_version: { type: Type.STRING },
    name: { type: Type.STRING },
    units: { type: Type.STRING, description: "Must be 'm'" },
    site: {
      type: Type.OBJECT,
      properties: {
        front_width: { type: Type.NUMBER },
        rear_width: { type: Type.NUMBER },
        depth: { type: Type.NUMBER },
        slope_height: { type: Type.NUMBER },
        orientation_front: { type: Type.STRING },
        boundary: { 
          type: Type.ARRAY, 
          description: "Array of [x, y] coordinates forming the lot perimeter",
          items: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        }
      },
      required: ["front_width", "depth", "slope_height", "orientation_front", "boundary"]
    },
    systems: {
      type: Type.OBJECT,
      properties: {
        hvac_type: { type: Type.STRING },
        structural_system: { type: Type.STRING }
      }
    },
    levels: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          elevation: { type: Type.NUMBER },
          height: { type: Type.NUMBER }
        },
        required: ["id", "name", "elevation"]
      }
    },
    spaces: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Space"] },
          name: { type: Type.STRING },
          level_id: { type: Type.STRING },
          category: { type: Type.STRING },
          boundary_walls: { type: Type.ARRAY, items: { type: Type.STRING } },
          area_target: { type: Type.NUMBER },
          area_actual: { type: Type.NUMBER },
          access_type: { type: Type.STRING },
          privacy_level: { type: Type.STRING },
          adjacency_requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          quality_checks: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["id", "type", "name", "level_id", "category", "boundary_walls"]
      }
    },
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Wall"] },
          level_id: { type: Type.STRING },
          start: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          end: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          height: { type: Type.NUMBER },
          thickness: { type: Type.NUMBER },
          structural: { type: Type.BOOLEAN },
          material: { type: Type.STRING },
          space_left: { type: Type.STRING },
          space_right: { type: Type.STRING },
          openings: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["id", "type", "level_id", "start", "end", "height", "thickness", "structural", "openings"]
      }
    },
    openings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Door", "Window"] },
          wall_id: { type: Type.STRING },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          sill_height: { type: Type.NUMBER },
          position_t: { type: Type.NUMBER, description: "Relative position along the wall form 0 to 1" }
        },
        required: ["id", "type", "wall_id", "width", "height", "sill_height", "position_t"]
      }
    },
    slabs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Floor", "Roof"] },
          level_id: { type: Type.STRING },
          boundary: {
            type: Type.ARRAY,
            description: "Array of [x, y] coordinates forming the slab perimeter",
            items: { type: Type.ARRAY, items: { type: Type.NUMBER } }
          },
          thickness: { type: Type.NUMBER },
          elevation_offset: { type: Type.NUMBER }
        },
        required: ["id", "type", "level_id", "boundary", "thickness"]
      }
    }
  },
  required: ["project_id", "schema_version", "name", "units", "site", "levels", "spaces", "walls", "openings"]
};

export type CriticReport = {
  axis: "programa" | "fluxo" | "implantacao" | "tecnica" | "forma";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
}[];

const criticSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      axis: { type: Type.STRING, enum: ["programa", "fluxo", "implantacao", "tecnica", "forma"] },
      severity: { type: Type.STRING, enum: ["info", "warning", "critical"] },
      title: { type: Type.STRING },
      message: { type: Type.STRING }
    },
    required: ["axis", "severity", "title", "message"]
  }
};

export async function analyzePBIM(project: PBIMProject): Promise<CriticReport> {
  const systemInstruction = `
Você é o ArchitecturalCriticAgent do ARQCdR, um sistema de análise semântica e paramétrica de modelos BIM.
Seu objetivo é atuar como um experiente Diretor de Projetos Arquitetônicos e Computational Designer.
Você irá receber a serialização estrutural completa de um projeto (PBIM JSON) contendo paredes, espaços, lote e integrações.

Aja com extrema sofisticação. Produza de 3 a 5 apontamentos críticos.
Critérios de Análise (Axis):
- programa: Relação simbiótica entre área construída e as expectativas do projeto (utilize 'area_target' vs 'area_actual', se disponível, ou faça estimativas heurísticas).
- fluxo: Análise topológica do grafo de ambientes (adjacências, circulação cruzada, 'boundary_walls').
- implantacao: Análise passiva bioclimática, adequação ao 'slope_height' e uso eficiente do lote.
- tecnica: Constructibilidade, vão livre estrutural e custo estimado da materialidade.
- forma: Opinião estilística e proporções espaciais, relação de pé-direito ('height' vs áreas).

IMPORTANTE: Forneça avaliações numéricas e dados palpáveis em sua 'message', deduzidos do JSON (por exemplo: "A área de 12m² para o quarto está 10% abaixo do padrão" ou "O vão de 6m exige atenção estrutural").
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: JSON.stringify(project),
    config: {
      responseMimeType: "application/json",
      responseSchema: criticSchema,
      systemInstruction: systemInstruction,
      temperature: 0.3,
      tools: [{ googleSearch: {} }]
    }
  });

  const text = response.text;
  if (!text) throw new Error("No output for Critic Agent");

  return JSON.parse(text);
}

export async function parseBriefingToPBIM(prompt: string): Promise<PBIMProject> {
  const systemInstruction = `
Você está trabalhando em uma plataforma web de vanguarda chamada Prompt-to-BIM (ARQCdR - Condenser AI).
Objetivo: criar uma ferramenta sofisticada para arquitetos em que o usuário descreve um projeto por linguagem natural e o sistema gera, deterministicamente, um modelo BIM interno semântico altamente detalhado.

Você atua como um 'Generative Architectural Algorithm':
1. Setores e Programa: Respeite COMPLETAMENTE os pedidos do usuário ("4 quartos e sala", etc). Se ele pediu 4 quartos, crie espaços e paredes o suficiente para acomodar 4 quartos e 1 sala, mais recintos adicionais lógicos (banheiros, cozinhas, corredores).
2. Geometria: O lote geralmente começa em [0,0] e se extende positivamente. Um lote de 15x30m iria de [0,0] a [15,0], [15,30], [0,30].
3. Lógica Espacial e Ortogonalidade: Desenhe UMA PLANTA BAIXA COMPLETA E FUNCIONAL conectando 'walls' para fechar retângulos perfeitos (spaces). 
   - Seja rigoroso na união de nós: Se uma parede termina em [5, 10, 0], a próxima DEVE começar em [5, 10, 0].
   - Um projeto realista (como a casa de 4 quartos) exige entre 20 a 50 paredes para ficar completo e verossímil.
   - Todo Space deve elencar os IDs das walls que o circundam, formando recintos fechados.
4. Sistemas Numéricos e BIM:
   - A espessura padrão (thickness) para paredes externas é 0.20m, e internas 0.15m. Parede estrutural = true se for carga.
   - Altura padrão de nível é 3.0m.
   - Aloque 'openings' (Portas e Janelas). Portas têm width 0.8-1.0, sill_height 0. Janelas têm sill_height 0.9-1.1, height 1.2-1.5. Crie portas e janelas para CADA cômodo, todas referenciadas aos IDs das walls corretas.
5. Inclusão OBRIGATÓRIA de Slabs (Lajes/Pisos/Telhados):
   - Você DEVE criar elementos arquitetônicos completos. Crie no array 'slabs' itens do tipo "Floor" que desenhem o piso dos ambientes, e itens do tipo "Roof" que cubram a edificação (elevação igual à altura das paredes).
   - O boundary das 'slabs' deve envolver a estrutura criada.
6. Nunca retorne erros humanos ou strings avulsas; retorne APENAS a estrutura JSON perfeita. Seja um Arquiteto e Engenheiro impecável.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: pbimSchema,
      systemInstruction: systemInstruction,
      temperature: 0.15,
      tools: [{ googleSearch: {} }]
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No output generated by Gemini");
  }

  const parsed = JSON.parse(text) as PBIMProject;
  
  // Enforce some defaults just in case
  parsed.schema_version = "0.1.0";
  parsed.units = "m";
  parsed.slabs = parsed.slabs || [];
  parsed.stairs = parsed.stairs || [];
  parsed.views = parsed.views || [];
  parsed.sheets = parsed.sheets || [];
  
  if (!parsed.project_id) {
    parsed.project_id = crypto.randomUUID();
  }

  return parsed;
}

export async function mutatePBIM(currentProject: PBIMProject, actionPrompt: string): Promise<PBIMProject> {
  const systemInstruction = `
Você é o Reborn Architectural Editor (Condenser AI) - Um agente de IA que altera projetos arquitetônicos.
Sua missão é receber um projeto existente (PBIM JSON) e aplicar as modificações solicitadas pelo usuário, mantendo a consistência do modelo. 

REGRAS CRÍTICAS DE EDIÇÃO GEOMÉTRICA E BIM:
1. Preserve o ID do projeto e tudo que não for afetado pela modificação.
2. Se o usuário pedir para adicionar um cômodo, recalcule as paredes (walls) e espaços (spaces) de forma coerente e ortogonal, garantindo nós de união corretos (start/end). 
3. Se pedir para remover, retire as paredes e atualize a malha (spaces, walls, openings).
4. Mantenha ou atualize 'slabs' (Floor, Roof) para acomodar a nova construção caso necessário.
5. Se pedir para mudar a implantação, atualize 'site'.
6. O resultado também deve ser UM JSON PERFEITO, aderente ao schema PBIM.
  `;

  // We serialize the current project and instruct the model to return the new JSON.
  const payload = `CURRENT_PBIM_MODEL:\n${JSON.stringify(currentProject)}\n\nUSER_MODIFICATION_REQUEST:\n${actionPrompt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: payload,
    config: {
      responseMimeType: "application/json",
      responseSchema: pbimSchema,
      systemInstruction: systemInstruction,
      temperature: 0.1,
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No output generated by Gemini");
  }

  const parsed = JSON.parse(text) as PBIMProject;
  
  parsed.schema_version = currentProject.schema_version || "0.1.0";
  parsed.units = currentProject.units || "m";
  parsed.project_id = currentProject.project_id;
  parsed.slabs = parsed.slabs || currentProject.slabs || [];
  parsed.stairs = parsed.stairs || currentProject.stairs || [];
  parsed.views = parsed.views || currentProject.views || [];
  parsed.sheets = parsed.sheets || currentProject.sheets || [];

  return parsed;
}
