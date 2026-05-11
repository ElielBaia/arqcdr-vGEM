import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

import { casaEstudioNovaSerrana } from "./src/lib/pbim/fixtures/casa_estudio_nova_serrana";
import { applyActionToPBIM } from "./src/lib/geometry_engine/mutations";

// In-Memory Database for the Current Project
let currentProjectState = JSON.parse(JSON.stringify(casaEstudioNovaSerrana));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === ARQCdR // Semantic BIM Endpoints ===
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Semantic Engine Online" });
  });

  // Briefing Parsing via Gemini AI
  app.post("/api/projects/from-briefing", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: "Missing prompt" });
      
      console.log(`[BIMCompiler] Received briefing, invoking Gemini...`);
      const { parseBriefingToPBIM } = await import("./src/lib/ai_agents/gemini_agent");
      const pbimModel = await parseBriefingToPBIM(prompt);
      console.log(`[BIMCompiler] Generation complete. Schema version: ${pbimModel.schema_version}`);
      
      currentProjectState = pbimModel;
      res.json(pbimModel);
    } catch (error) {
      console.error("[BIMCompiler Error]:", error);
      res.json(currentProjectState);
    }
  });

  // Critic Agent via Gemini AI
  app.post("/api/projects/critic", async (req, res) => {
    try {
      const { project } = req.body;
      if (!project) return res.status(400).json({ error: "Missing project" });

      console.log(`[ArchitecturalCritic] Generating critic report...`);
      const { analyzePBIM } = await import("./src/lib/ai_agents/gemini_agent");
      const report = await analyzePBIM(project);
      res.json(report);
    } catch (error) {
      console.error("[ArchitecturalCritic Error]:", error);
      res.status(500).json({ error: "Failed to generate critic report" });
    }
  });

  // Action Parsing via Gemini AI (Reborn)
  app.post("/api/projects/action", async (req, res) => {
    try {
      const { prompt, targetId, currentProject } = req.body;
      if (!prompt || !currentProject) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      
      console.log(`[RebornAgent] Mutating project...`);
      const { mutatePBIM } = await import("./src/lib/ai_agents/gemini_agent");
      const updatedModel = await mutatePBIM(currentProject, prompt);
      console.log(`[RebornAgent] Mutation complete.`);
      
      currentProjectState = updatedModel;
      
      res.json({ actionAlert: { explanation: "Model updated via Reborn Conversational AI." }, updatedModel: currentProjectState });
    } catch (error) {
      console.error("[RebornAgent Error]:", error);
      res.status(500).json({ error: "Failed to mutate PBIM" });
    }
  });

  // PBIM Object retrieval
  app.get("/api/projects/:id/model", (req, res) => {
    res.json(currentProjectState);
  });

  // Vite middleware for development (Frontend integration)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production behavior
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ARQCdR] Semantic Engine listening on http://localhost:${PORT}`);
  });
}

startServer();
