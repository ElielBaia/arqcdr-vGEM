import { z } from 'zod';

// ==========================================
// ARQCdR - PBIM (Pre-BIM) Data Schemas
// ==========================================

export const SiteSchema = z.object({
  front_width: z.number(),
  rear_width: z.number().optional(),
  depth: z.number(),
  slope_height: z.number(),
  orientation_front: z.string(),
  boundary: z.array(z.tuple([z.number(), z.number()]))
});

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  height: z.number().default(3.0)
});

export const MaterialSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  u_value: z.number().optional(), // Thermal transmittance
  embodied_carbon: z.number().optional() // kgCO2e
});

export const WallSchema = z.object({
  id: z.string(),
  type: z.literal("Wall"),
  level_id: z.string(),
  start: z.tuple([z.number(), z.number(), z.number()]),
  end: z.tuple([z.number(), z.number(), z.number()]),
  height: z.number(),
  thickness: z.number(),
  material: z.string().optional(),
  structural: z.boolean().default(false),
  space_left: z.string().optional(),
  space_right: z.string().optional(),
  openings: z.array(z.string()).default([])
});

export const OpeningSchema = z.object({
  id: z.string(),
  type: z.enum(["Door", "Window"]),
  wall_id: z.string(),
  width: z.number(),
  height: z.number(),
  sill_height: z.number().default(0), // 0 for doors
  position_t: z.number().min(0).max(1) // Relative position along the wall (0 to 1)
});

export const SpaceSchema = z.object({
  id: z.string(),
  type: z.literal("Space"),
  name: z.string(),
  level_id: z.string(),
  category: z.string(),
  boundary_walls: z.array(z.string()),
  area_target: z.number().optional(),
  area_actual: z.number().optional(),
  access_type: z.string().optional(),
  privacy_level: z.string().optional(),
  adjacency_requirements: z.array(z.string()).default([]),
  quality_checks: z.array(z.string()).default([])
});

export const SlabSchema = z.object({
  id: z.string(),
  type: z.enum(["Floor", "Roof"]),
  level_id: z.string(),
  boundary: z.array(z.tuple([z.number(), z.number()])),
  thickness: z.number().default(0.15),
  elevation_offset: z.number().default(0),
});

export const BuildingSystemsSchema = z.object({
  hvac_type: z.string().optional(),
  structural_system: z.string().optional()
});

export const ProjectSchema = z.object({
  project_id: z.string().uuid(),
  schema_version: z.string(),
  name: z.string(),
  units: z.literal("m"),
  site: SiteSchema.optional(),
  levels: z.array(LevelSchema).default([]),
  spaces: z.array(SpaceSchema).default([]),
  walls: z.array(WallSchema).default([]),
  openings: z.array(OpeningSchema).default([]),
  materials: z.record(z.string(), MaterialSchema).optional(),
  systems: BuildingSystemsSchema.optional(),
  slabs: z.array(SlabSchema).default([]),
  stairs: z.array(z.any()).default([]), // To be typed
  views: z.array(z.any()).default([]),  // To be typed
  sheets: z.array(z.any()).default([])  // To be typed
});

export type PBIMSlab = z.infer<typeof SlabSchema>;

export type PBIMProject = z.infer<typeof ProjectSchema>;
export type PBIMSpace = z.infer<typeof SpaceSchema>;
export type PBIMWall = z.infer<typeof WallSchema>;
export type PBIMOpening = z.infer<typeof OpeningSchema>;
