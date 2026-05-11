import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { PBIMProject, PBIMWall } from '../lib/pbim/schema';

// Helper to convert Wall to 3D Transform
const buildWallTransform = (wall: PBIMWall) => {
  const [x1, y1] = wall.start;
  const [x2, y2] = wall.end;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  // Center point
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  
  // Angle
  const angle = Math.atan2(-dy, dx); 

  return {
    position: [cx, wall.height / 2, -cy] as [number, number, number],
    rotation: [0, angle, 0] as [number, number, number],
    args: [length, wall.height, wall.thickness] as [number, number, number],
    structural: wall.structural,
    length,
    dx, dy
  };
};

const WallMesh = ({ wall, project, selected, onClick, clipPlanes }: { wall: PBIMWall, project: PBIMProject, selected: boolean, onClick: (e: any) => void, clipPlanes: THREE.Plane[] }) => {
  const { position, rotation, args, structural, length } = useMemo(() => buildWallTransform(wall), [wall]);

  let baseColor = structural ? '#f0f0f0' : '#ffffff';
  if (wall.material && project.materials && project.materials[wall.material]) {
      const mat = project.materials[wall.material] as any;
      if (mat.color) {
        baseColor = mat.color;
      }
  }
  
  const wallOpenings = project.openings?.filter(o => o.wall_id === wall.id) || [];

  return (
    <group position={position} rotation={rotation}>
      <mesh 
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
        userData={{ type: 'Wall', id: wall.id }}
      >
        <boxGeometry args={args} />
        <meshStandardMaterial color={selected ? '#ffdddd' : baseColor} roughness={0.9} transparent={selected} opacity={selected ? 0.8 : 1} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
        <Edges scale={1} threshold={15} color={selected ? '#ff0000' : '#141414'} />
      </mesh>
      
      {/* Draw Openings as Overlays */}
      {wallOpenings.map(op => {
         // position_t is along the length, 0 to 1.
         const localX = (op.position_t - 0.5) * length;
         // Local Y from bottom of wall
         const localY = -wall.height/2 + (op.sill_height || 0) + op.height/2;
         const opTypeColor = op.type === 'Window' ? '#aaddff' : '#444444';
         
         return (
           <mesh key={op.id} position={[localX, localY, 0]}>
              <boxGeometry args={[op.width, op.height, wall.thickness + 0.05]} />
              <meshStandardMaterial color={opTypeColor} roughness={0.2} transparent opacity={op.type === 'Window' ? 0.6 : 1.0} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
              <Edges scale={1} threshold={15} color="#141414" />
           </mesh>
         )
      })}
    </group>
  );
};

const SlabMesh = ({ slab, selected, onClick, clipPlanes }: { slab: any, selected: boolean, onClick: (e: any) => void, clipPlanes: THREE.Plane[] }) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (!slab.boundary || slab.boundary.length < 3) return null;
    
    // Y in 2D goes to -Z in 3D
    shape.moveTo(slab.boundary[0][0], -slab.boundary[0][1]);
    for(let i = 1; i < slab.boundary.length; i++) {
        shape.lineTo(slab.boundary[i][0], -slab.boundary[i][1]);
    }
    shape.lineTo(slab.boundary[0][0], -slab.boundary[0][1]); // close

    const extrudeSettings = {
      depth: slab.thickness || 0.15,
      bevelEnabled: false,
    };
    
    // Extrude geometry goes in Z, so we rotate it to lie flat.
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Move the pivot to the bottom so "depth" goes upwards
    geo.rotateX(Math.PI / 2);
    // ExtrudeGeometry extrudes along +Z. After rotateX(PI/2), it goes along -Y. 
    // Wait, let's fix that. Extrude goes along +Z. RotateX(-PI/2) means it goes into -Y.
    // RotateX(PI/2) means it goes into +Y.
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    
    return geo;
  }, [slab]);

  if (!geometry) return null;

  const baseColor = slab.type === 'Roof' ? '#888888' : '#e0e0e0';
  // If roof, maybe it's floating. Assume elevation_offset adds to the Z (Y in 3D).
  const yPos = slab.elevation_offset || 0;

  return (
    <mesh 
      geometry={geometry} 
      position={[0, yPos + (slab.type === 'Roof' ? slab.thickness : 0), 0]} // Offset up or down depending on how we handle it
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      <meshStandardMaterial color={selected ? '#ffdddd' : baseColor} roughness={0.8} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
      <Edges scale={1} threshold={15} color={selected ? '#ff0000' : '#444'} />
    </mesh>
  );
};

export const ThreeDViewer = ({ 
  project, 
  selectedObjectId, 
  onSelect 
}: { 
  project: PBIMProject, 
  selectedObjectId: string | null,
  onSelect: (id: string | null) => void 
}) => {
  
  // Calculate scene center
  const center = useMemo(() => {
    if (!project || project.walls.length === 0) return [0, 0, 0] as [number, number, number];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    project.walls.forEach(w => {
      minX = Math.min(minX, w.start[0], w.end[0]);
      minY = Math.min(minY, w.start[1], w.end[1]);
      maxX = Math.max(maxX, w.start[0], w.end[0]);
      maxY = Math.max(maxY, w.start[1], w.end[1]);
    });
    return [(minX + maxX)/2, 0, -(minY + maxY)/2] as [number, number, number];
  }, [project]);

  // Section / Cut Plane (Example to cut along X axis, looking +X)
  // To avoid cutting everything unless user wants, we can make it a toggle, but for now we won't clip by default.
  // We can attach `clippingPlanes` to all materials.
  const [isSectionActive, setIsSectionActive] = React.useState(false);
  const clipPlanes = useMemo(() => {
      if (!isSectionActive) return [];
      // Plane cutting halfway through the building
      return [new THREE.Plane(new THREE.Vector3(1, 0, 0), -(center[0]))];
  }, [isSectionActive, center]);

  return (
    <div className="relative w-full h-full">
      <button 
         className="absolute top-4 left-4 z-10 font-mono text-xs uppercase bg-white border border-black px-2 py-1 hover:bg-black hover:text-white"
         onClick={() => setIsSectionActive(!isSectionActive)}
      >
         {isSectionActive ? 'Disable Section 🔴' : 'Enable Section (Corte) ✂️'}
      </button>

      <Canvas shadows camera={{ position: [center[0], 25, center[2] + 25], fov: 45 }} gl={{ localClippingEnabled: true }}>
        {/* Monochromatic "studio" lighting */}
        <ambientLight intensity={0.7} />
      <directionalLight position={[15, 30, 15]} intensity={1.5} castShadow shadow-bias={-0.0001} />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} />

      {/* Grid on the ground */}
      <gridHelper args={[150, 150, '#000000', '#dddddd']} position={[0, -0.01, 0]} material-opacity={0.3} material-transparent />
      
      {/* 3D Walls */}
      {project.walls.map(wall => (
        <WallMesh 
          key={wall.id} 
          wall={wall} 
          project={project}
          selected={selectedObjectId === wall.id}
          clipPlanes={clipPlanes}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(wall.id);
          }}
        />
      ))}

      {/* Simple Ground plane for raycasting unselect */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.05, 0]} 
        receiveShadow 
        onClick={() => onSelect(null)}
      >
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      
      {/* 3D Slabs (Floors, Roofs) */}
      {project.slabs?.map(slab => (
        <SlabMesh 
          key={slab.id} 
          slab={slab} 
          selected={selectedObjectId === slab.id}
          clipPlanes={clipPlanes}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(slab.id);
          }}
        />
      ))}

      <OrbitControls target={center} makeDefault minPolarAngle={0} maxPolarAngle={Math.PI/2 - 0.1} />
    </Canvas>
    </div>
  );
};
