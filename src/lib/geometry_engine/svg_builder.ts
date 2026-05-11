import { PBIMProject, PBIMWall } from '../pbim/schema';

/**
 * Geometric helper class to process PBIM models into drawing representations (like SVGs).
 */
export class GeometryEngine {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  /**
   * Generates a 2D SVG string of a given level.
   */
  public generateSVGPlan(levelId: string, activeId: string | null = null, width = 800, height = 600, padding = 40): string {
    const wallsOnLevel = this.project.walls.filter(w => w.level_id === levelId);
    
    // 1. Calculate bounding box of the site & building to auto-scale
    let minX = 0, minY = 0, maxX = 10, maxY = 10;
    
    if (this.project.site) {
      const b = this.project.site.boundary;
      if (b.length > 0) {
        minX = Math.min(...b.map(pt => pt[0]));
        minY = Math.min(...b.map(pt => pt[1]));
        maxX = Math.max(...b.map(pt => pt[0]));
        maxY = Math.max(...b.map(pt => pt[1]));
      }
    } else if (wallsOnLevel.length > 0) {
      minX = Math.min(...wallsOnLevel.map(w => Math.min(w.start[0], w.end[0])));
      minY = Math.min(...wallsOnLevel.map(w => Math.min(w.start[1], w.end[1])));
      maxX = Math.max(...wallsOnLevel.map(w => Math.max(w.start[0], w.end[0])));
      maxY = Math.max(...wallsOnLevel.map(w => Math.max(w.start[1], w.end[1])));
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // Use a fixed scale drawing approach or a viewbox
    // For SVG, we can just use the natural units and let the SVG viewBox handle scaling.
    const viewBoxMinX = minX - 2;
    const viewBoxMinY = minY - 2;
    const viewBoxWidth = spanX + 4;
    const viewBoxHeight = spanY + 4;

    let svgElements: string[] = [];

    // --- Draw Site ---
    if (this.project.site) {
      const pts = this.project.site.boundary.map(p => `${p[0]},${p[1]}`).join(' ');
      svgElements.push(`
        <g id="layer-site-boundary">
          <polygon points="${pts}" fill="none" stroke="#888888" stroke-width="0.05" stroke-dasharray="0.5 0.5" />
        </g>
      `);
    }

    // --- Draw Spaces (Backgrounds / Annotations) ---
    svgElements.push(`<g id="layer-spaces">`);
    const spacesOnLevel = this.project.spaces.filter(s => s.level_id === levelId);
    
    for (const space of spacesOnLevel) {
      const bWalls = this.project.walls.filter(w => space.boundary_walls.includes(w.id));
      if (bWalls.length > 0) {
        // Compute precise inner bounds for the space by finding min/max coords of bounded walls
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        bWalls.forEach(w => {
           sMinX = Math.min(sMinX, w.start[0], w.end[0]);
           sMinY = Math.min(sMinY, w.start[1], w.end[1]);
           sMaxX = Math.max(sMaxX, w.start[0], w.end[0]);
           sMaxY = Math.max(sMaxY, w.start[1], w.end[1]);
        });

        const cx = (sMinX + sMaxX) / 2;
        const cy = (sMinY + sMaxY) / 2;
        const isSelected = activeId === space.id;
        
        let spaceFillColor = 'rgba(230, 230, 230, 0.4)';
        if (space.category?.toLowerCase() === 'social') spaceFillColor = 'rgba(255, 230, 200, 0.4)';
        else if (space.category?.toLowerCase() === 'intimate' || space.category?.toLowerCase() === 'intimo') spaceFillColor = 'rgba(200, 220, 255, 0.4)';
        else if (space.category?.toLowerCase() === 'service' || space.category?.toLowerCase() === 'servico') spaceFillColor = 'rgba(220, 255, 220, 0.4)';
        else if (space.category?.toLowerCase() === 'circulation') spaceFillColor = 'rgba(255, 255, 200, 0.4)';

        svgElements.push(`
          <rect x="${sMinX}" y="${sMinY}" width="${sMaxX - sMinX}" height="${sMaxY - sMinY}" 
                fill="${isSelected ? 'rgba(255, 0, 0, 0.2)' : spaceFillColor}" 
                stroke="${isSelected ? '#ff0000' : 'none'}"
                stroke-width="0.05"
                class="hover:fill-black/10 cursor-pointer pbim-object transition-all" 
                data-type="Space" 
                data-id="${space.id}" />
        `);

        // Draw Annotations
        svgElements.push(`
          <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="0.4" font-weight="bold" fill="#141414" opacity="0.8" transform="scale(1, -1) translate(0, ${-2*cy})" pointer-events="none">
            ${space.name.toUpperCase()}
          </text>
          <text x="${cx}" y="${cy + 0.6}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="0.3" fill="#141414" opacity="0.6" transform="scale(1, -1) translate(0, ${-2*(cy+0.6)})" pointer-events="none">
            ${space.area_target || space.area_actual || '?'} m²
          </text>
        `);
      }
    }
    svgElements.push(`</g>`);

    // --- Draw Walls ---
    svgElements.push(`<g id="layer-wall-cut">`);
    for (const wall of wallsOnLevel) {
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const nx = -dy / len;
      const ny = dx / len;

      const t2 = wall.thickness / 2;
      const p1x = wall.start[0] + nx * t2;
      const p1y = wall.start[1] + ny * t2;
      const p2x = wall.start[0] - nx * t2;
      const p2y = wall.start[1] - ny * t2;
      
      const p3x = wall.end[0] - nx * t2;
      const p3y = wall.end[1] - ny * t2;
      const p4x = wall.end[0] + nx * t2;
      const p4y = wall.end[1] + ny * t2;

      // Check for openings on this wall
      const wallOpenings = this.project.openings.filter(o => o.wall_id === wall.id);
      
      // Handle selection state
      const isSelected = activeId === wall.id;
      const fillColor = isSelected ? '#ff0000' : (wall.structural ? '#141414' : '#666666');

      // Simple solid wall for MVP
      svgElements.push(`
        <polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}" 
                 fill="${fillColor}" 
                 stroke="#141414" 
                 stroke-width="0.02"
                 class="cursor-pointer pbim-object transition-all hover:fill-red-800"
                 data-type="Wall"
                 data-id="${wall.id}" />
      `);

      // Draw openings cutouts (simplified)
      for (const op of wallOpenings) {
        const cx = wall.start[0] + dx * op.position_t;
        const cy = wall.start[1] + dy * op.position_t;
        
        const hWt = op.width / 2;
        const o1x = cx - (dx/len) * hWt + nx * t2;
        const o1y = cy - (dy/len) * hWt + ny * t2;
        
        const o2x = cx - (dx/len) * hWt - nx * t2;
        const o2y = cy - (dy/len) * hWt - ny * t2;

        const o3x = cx + (dx/len) * hWt - nx * t2;
        const o3y = cy + (dy/len) * hWt - ny * t2;

        const o4x = cx + (dx/len) * hWt + nx * t2;
        const o4y = cy + (dy/len) * hWt + ny * t2;

        // Cutout rect (drawn over the wall as white, or gray for windows)
        svgElements.push(`
          <polygon points="${o1x},${o1y} ${o2x},${o2y} ${o3x},${o3y} ${o4x},${o4y}" fill="${op.type === 'Door' ? '#ffffff' : '#dddddd'}" stroke="#141414" stroke-width="0.02"/>
        `);

        // If door, draw arc
        if (op.type === 'Door') {
          // Simple door visual
           svgElements.push(`
            <line x1="${o1x}" y1="${o1y}" x2="${o1x - nx * op.width}" y2="${o1y - ny * op.width}" stroke="#141414" stroke-width="0.02"/>
          `);
        }
      }
    }
    svgElements.push(`</g>`);


    // --- Draw Dimensions ---
    svgElements.push(`<g id="layer-dimensions">`);
    const dimOffset = 2; // offset from bounding box
    
    // Bottom Dimension (Width)
    const dimYBottom = minY - dimOffset;
    svgElements.push(`
      <line x1="${minX}" y1="${dimYBottom}" x2="${maxX}" y2="${dimYBottom}" stroke="#141414" stroke-width="0.02" />
      <line x1="${minX}" y1="${minY - 0.5}" x2="${minX}" y2="${dimYBottom - 0.5}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.1 0.1" />
      <line x1="${maxX}" y1="${minY - 0.5}" x2="${maxX}" y2="${dimYBottom - 0.5}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.1 0.1" />
      <path d="M${minX - 0.2} ${dimYBottom - 0.2} L${minX + 0.2} ${dimYBottom + 0.2}" stroke="#141414" stroke-width="0.04" />
      <path d="M${maxX - 0.2} ${dimYBottom - 0.2} L${maxX + 0.2} ${dimYBottom + 0.2}" stroke="#141414" stroke-width="0.04" />
      <text x="${(minX + maxX)/2}" y="${dimYBottom + 0.4}" text-anchor="middle" dominant-baseline="bottom" font-family="monospace" font-size="0.5" fill="#141414" transform="scale(1, -1) translate(0, ${-2*(dimYBottom + 0.4)})" pointer-events="none">${(maxX - minX).toFixed(2)}</text>
    `);

    // Left Dimension (Depth)
    const dimXLeft = minX - dimOffset;
    svgElements.push(`
      <line x1="${dimXLeft}" y1="${minY}" x2="${dimXLeft}" y2="${maxY}" stroke="#141414" stroke-width="0.02" />
      <line x1="${minX - 0.5}" y1="${minY}" x2="${dimXLeft - 0.5}" y2="${minY}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.1 0.1" />
      <line x1="${minX - 0.5}" y1="${maxY}" x2="${dimXLeft - 0.5}" y2="${maxY}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.1 0.1" />
      <path d="M${dimXLeft - 0.2} ${minY - 0.2} L${dimXLeft + 0.2} ${minY + 0.2}" stroke="#141414" stroke-width="0.04" />
      <path d="M${dimXLeft - 0.2} ${maxY - 0.2} L${dimXLeft + 0.2} ${maxY + 0.2}" stroke="#141414" stroke-width="0.04" />
      <text x="${dimXLeft - 0.4}" y="${(minY + maxY)/2}" text-anchor="middle" dominant-baseline="bottom" font-family="monospace" font-size="0.5" fill="#141414" transform="scale(1, -1) translate(0, ${-2*((minY + maxY)/2)}) rotate(-90, ${dimXLeft - 0.4}, ${(minY + maxY)/2})" pointer-events="none">${(maxY - minY).toFixed(2)}</text>
    `);
    svgElements.push(`</g>`);

    // Assemble SVG
    // Note: SVG Y-axis points down by default, but architectural CAD usually has Y up.
    // We can use a transform on the root group to flip Y so Y goes up.
    return `
      <svg width="100%" height="100%" viewBox="${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg">
        <g transform="scale(1, -1) translate(0, -${viewBoxHeight + 2 * viewBoxMinY})">
          ${svgElements.join('\n')}
        </g>
      </svg>
    `;
  }
}
