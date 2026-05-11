import { PBIMProject } from '../pbim/schema';

export class ElevationBuilder {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  // Generate a simple Front Elevation
  generateFrontElevationSVG(): string {
    if (!this.project || !this.project.walls) return '<svg></svg>';

    let svgElements: string[] = [];
    
    // Group everything
    svgElements.push(`<g id="elevation-front">`);

    // Basic ground line
    svgElements.push(`<line x1="-10" y1="0" x2="30" y2="0" stroke="#141414" stroke-width="0.1" />`);

    // In a front elevation, we look from the front (Y = 0) towards the positive Y.
    // Walls that run along the X-axis (dx !== 0, dy === 0) will be visible.
    // For simplicity of this MVP, let's just project all walls down to the X axis.
    
    this.project.walls.forEach(wall => {
      const x1 = wall.start[0];
      const x2 = wall.end[0];
      const y1 = wall.start[1];
      const y2 = wall.end[1];
      
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const isVisibleFromFront = (y1 < 10 || y2 < 10) && (maxX - minX) > 0.1; // simple heuristic
      
      if (isVisibleFromFront && (maxX - minX) > 0.1) {
        // Find which level this wall belongs to
        const level = this.project.levels?.find(l => l.id === wall.level_id);
        const baseZ = level ? level.elevation : 0;
        const topZ = baseZ + wall.height;

        // Draw the wall projection
        svgElements.push(`<rect x="${minX}" y="${baseZ}" width="${maxX - minX}" height="${wall.height}" fill="#f5f5f5" stroke="#141414" stroke-width="0.03" />`);

        // Openings
        if (this.project.openings) {
          this.project.openings.forEach(op => {
            if (op.wall_id === wall.id) {
              const opW = op.width;
              const opH = op.height;
              const opSill = op.sill_height || 0;
              // position_t goes from start to end.
              let opX = x1 + (x2 - x1) * op.position_t;
              
              // Draw opening
              const leftX = opX - opW/2;
              const bottomZ = baseZ + opSill;
              
              svgElements.push(`<rect x="${leftX}" y="${bottomZ}" width="${opW}" height="${opH}" fill="${op.type === 'Window' ? '#aaddff' : '#cccccc'}" stroke="#141414" stroke-width="0.02" />`);
              
              if (op.type === 'Window') {
                // simple window cross
                svgElements.push(`<line x1="${leftX + opW/2}" y1="${bottomZ}" x2="${leftX + opW/2}" y2="${bottomZ+opH}" stroke="#141414" stroke-width="0.01" />`);
                svgElements.push(`<line x1="${leftX}" y1="${bottomZ + opH/2}" x2="${leftX + opW}" y2="${bottomZ+opH/2}" stroke="#141414" stroke-width="0.01" />`);
              }
            }
          });
        }
      }
    });

    const levelCount = this.project.levels ? this.project.levels.length : 1;
    const maxZ = levelCount * 3.5;

    svgElements.push(`</g>`);
    
    // Y points DOWN in SVG, so we translate and flip Y to make positive Y go UP.
    // X goes from -2 to 15, Y goes from -1 to maxZ+2
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -1 18 ${maxZ + 2}" width="100%" height="100%">
        <g transform="scale(1, -1) translate(0, -${maxZ + 1})">
          ${svgElements.join('\\n')}
        </g>
      </svg>
    `;
  }
}
