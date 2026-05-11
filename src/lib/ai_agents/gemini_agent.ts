import dotenv from 'dotenv';
dotenv.config({ override: true });
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { PBIMProject } from '../pbim/schema';
import { knowledgeContextForLLM } from '../knowledge/nbr15575';
import { buildInvariantSet } from '../interpreter/decoder';
import { validateProject, ValidationReport } from '../interpreter/validator';
import type { InvariantSet } from '../interpreter/invariants';

/** ARQCdR: PBIM + camada semantica do interpretador. */
export interface EnrichedPBIM {
  project: PBIMProject;
  interpreter: InvariantSet;
  validation: ValidationReport;
}

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY environment variable is required and must be valid. Please configure it in the AI Studio Secrets panel.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

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

  const response = await getAIClient().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: JSON.stringify(project),
    config: {
      responseMimeType: "application/json",
      responseSchema: criticSchema,
      systemInstruction: systemInstruction,
      temperature: 0.3
    }
  });

  const text = response.text;
  if (!text) throw new Error("No output for Critic Agent");

  return JSON.parse(text);
}

export async function parseBriefingToPBIM(prompt: string): Promise<PBIMProject> {
  const enriched = await parseBriefingToPBIMEnriched(prompt);
  return enriched.project;
}

/**
 * ARQCdR pipeline enriquecido:
 *  1) decoder local detecta partido (compacto/L/U_patio/barra) + invariantes BR
 *  2) Knowledge NBR + invariantes vao no system prompt do Gemini como restricoes
 *  3) Gemini gera respeitando essas regras
 *  4) Validator NBR roda no output (deterministico, sem LLM)
 */
export async function parseBriefingToPBIMEnriched(prompt: string): Promise<EnrichedPBIM> {
  const invariantSet = buildInvariantSet(prompt);
  const nbrContext = knowledgeContextForLLM();
  const invariantContext = invariantSet.invariants.map(inv => {
    if (inv.kind === "zone_placement") return `- Zoneamento: ${inv.sector} em ${inv.region} (eixo ${inv.axis} fracao ${inv.fraction.join("-")}) - ${inv.rationale}`;
    if (inv.kind === "orientation")    return `- Orientacao: ${inv.appliesTo} prefere ${inv.preferred.join("/")} evita ${inv.forbidden.join("/")} - ${inv.rationale}`;
    if (inv.kind === "void_placement") return `- Vazio central: minimo ${inv.areaMinM2}m2, aspect ${inv.aspectRatioMax}, ${inv.centroidHint} - ${inv.rationale}`;
    if (inv.kind === "axis_placement") return `- Eixo: ${inv.direction}, largura ${inv.widthM}m - ${inv.rationale}`;
    if (inv.kind === "proportion")     return `- Proporcao: aspect ${inv.aspectRatioMin}-${inv.aspectRatioMax} - ${inv.rationale}`;
    return "";
  }).join("\n");

  const systemInstruction = `
Voce e o BIMCompilerAgent do ARQCdR Condenser AI - plataforma prompt-to-BIM semantica para arquitetos brasileiros.
${nbrContext}

## PARTIDO DETECTADO PELO INTERPRETADOR
Padrao: ${invariantSet.pattern}
Narrativa: ${invariantSet.partiNarrative}

## INVARIANTES ARQUITETONICAS A RESPEITAR
${invariantContext}

## REGRAS DE GERACAO
1. Programa: respeite o numero exato de quartos/suites/banheiros pedidos. Use AREAS da knowledge base como referencia.
2. Geometria: lote em [0,0]+. Walls com nos unidos exatamente.
3. Paredes: thickness 0.20 externa, 0.15 interna, 0.15 molhada. structural=true em portantes. Altura 3.0m.
4. Aberturas NBR 15575: porta interna 0.80, banheiro 0.70, externa 0.90, principal 1.00 (h 2.20). Janelas: quarto 1.20x1.20 peitoril 1.10; sala 2.00x1.20 peitoril 0.90; cozinha 1.20x1.00 peitoril 1.10; banheiro 0.60x0.60 peitoril 1.50. CADA comodo com porta + ao menos uma janela (exceto lavabo/circulacao/garagem).
5. Setorizacao BR: social na frente, intimo nos fundos, servico lateral. Quartos L/NL, sociais N, cozinha S/SE, banheiro S/SO.
6. Slabs: SEMPRE crie Floor envolvendo edificacao e Roof acima das paredes.
7. Padrao deve aparecer na geometria: U_patio com vazio central; L com dois bracos ortogonais; barra longitudinal; compacto bloco unico.
8. Use category correta: bedroom_couple, bedroom_single, bathroom, kitchen, living, dining, service_area, office, garage, circulation, lavabo, master_suite, bedroom.
9. APENAS JSON valido aderente ao schema.
  `;

  const response = await getAIClient().models.generateContent({
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
  if (!text) throw new Error("No output generated by Gemini");
  const parsed = JSON.parse(text) as PBIMProject;

  parsed.schema_version = "0.1.0";
  parsed.units = "m";
  parsed.slabs = parsed.slabs || [];
  parsed.stairs = parsed.stairs || [];
  parsed.views = parsed.views || [];
  parsed.sheets = parsed.sheets || [];
  if (!parsed.project_id) parsed.project_id = crypto.randomUUID();

  const validation = validateProject(parsed);
  return { project: parsed, interpreter: invariantSet, validation };
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

  const response = await getAIClient().models.generateContent({
    model: 'gemini-2.5-flash',
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
