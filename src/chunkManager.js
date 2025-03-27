import { Vector2, Vector3 } from 'three';
import Chunk from './chunk';
import { createNoise2D } from 'simplex-noise';
import { getHeight } from './heightGenerator';

const _V = new Vector2(0, 0);
const isMobile = window.innerWidth < 768;

export default class ChunkManager {
  chunks = {};
  chunkKeys = [];
  lastChunkVisited = null;
  pool = [];
  // Extend distance for better mountain coverage (more chunks)
  maxDistance = isMobile ? 4 : 5; 
  activePhysicsChunks = new Set();
  mountainCenter = new Vector2(0, 0); // Center of the mountain

  constructor(chunkSize, target, params, scene, uniforms, assets, physicsWorld = null) {
    this.params = params;
    this.target = target; // The ball
    this.chunkSize = chunkSize;
    this.scene = scene;
    this.uniforms = uniforms;
    this.assets = assets;
    this.physicsWorld = physicsWorld;

    // Create noise functions for terrain generation
    this.noise = [];
    for (let i = 0; i < params.octaves; i++) {
      this.noise[i] = createNoise2D();
    }

    this.init();
  }

  init() {
    // Start by loading chunks around mountain center
    this.updateChunks();
    
    // Create center chunk with mountain peak with highest detail first
    this.createChunk(0, 0, 0);
    console.log("Creating center chunk for mountain peak");
    
    // Create surrounding chunks with high detail for physics stability
    // This ensures a larger physics-enabled area around the starting point
    const physicsRadius = 2; // Radius of physics-enabled chunks
    for (let i = -physicsRadius; i <= physicsRadius; i++) {
      for (let j = -physicsRadius; j <= physicsRadius; j++) {
        if (i === 0 && j === 0) continue; // Skip center chunk (already created)
        this.createChunk(i, j, 0); // Create surrounding chunks with highest detail
        console.log(`Creating physics chunk at ${i},${j}`);
      }
    }
    
    // Wait for chunks to load before trying to place the ball
    setTimeout(() => {
      // Find mountain peak and log it
      const peak = this.findMountainPeak();
      console.log("Mountain peak located at:", peak);
    }, 500);
  }

  getLODbyCoords(k, w) {
    const [i, j] = this.getCoordsByTarget();
    
    // Distance from mountain center (more important than player position)
    const distFromMountain = _V.set(k, w).length();
    // Distance from player
    const distFromPlayer = _V.set(k - i, w - j).length();
    
    // Calculate LOD based on both distances
    // Higher weight for distance from player, but still consider mountain center
    return Math.floor((distFromPlayer * 0.7 + distFromMountain * 0.3) * 0.9);
  }

  isOutOfRange(k, w, [i, j]) {
    const distanceFromPlayer = _V.set(k - i, w - j).length();
    const distanceFromMountain = _V.set(k, w).length(); // Distance from mountain center
    
    // Keep chunks that are either close to player or close to mountain
    if (distanceFromPlayer <= this.maxDistance) return false;
    if (distanceFromMountain <= this.maxDistance - 1) return false;
    
    return true;
  }

  createChunk(i, j, LOD) {
    LOD = LOD || this.params.LOD;

    if (this.chunks[`${i}|${j}`] === undefined) {
      const position = new Vector3(i + 0.5, 0, j + 0.5);
      position.multiplyScalar(this.chunkSize);
      const chunk = new Chunk(
        this.chunkSize,
        this.noise,
        this.params,
        LOD,
        position,
        this.uniforms,
        this.assets
      );
      chunk.coords = [i, j];
      this.chunks[`${i}|${j}`] = chunk;
      this.chunkKeys.push(`${i}|${j}`);
      this.scene.add(chunk);
      
      // Add physics for close chunks or center mountain chunks
      // Important: Create physics for all chunks within a certain radius from center
      const distFromCenter = Math.sqrt(i*i + j*j);
      if (this.physicsWorld && (LOD <= 1 || distFromCenter <= 2)) {
        console.log(`Adding physics for chunk ${i},${j}`);
        const physicsBody = this.physicsWorld.addHeightfieldFromChunk(chunk);
        if (physicsBody) {
          this.activePhysicsChunks.add(`${i}|${j}`);
        } else {
          console.warn(`Failed to create physics for chunk ${i},${j}`);
        }
      }
    }
  }

  async updateChunks() {
    const [i, j] = this.getCoordsByTarget();

    // Sort by distance for efficient updates
    this.pool.sort((a, b) => {
      const aL = Math.sqrt((a.coords?.[0] - i) ** 2 + (a.coords?.[1] - j) ** 2);
      const bL = Math.sqrt((b.coords?.[0] - i) ** 2 + (b.coords?.[1] - j) ** 2);
      return bL - aL;
    });

    let count = 0;

    const currentChunkKey = `${i}|${j}`;
    if (currentChunkKey === this.lastChunkVisited) {
      // Process a few chunks each frame to maintain performance
      for (let g = 0; g < (isMobile ? 1 : 2); g++) {
        const { callback, LOD } = this.pool.pop() || {};
        if (callback) {
          callback();
        }

        count++;

        if (LOD <= 1 && count === 1) {
          break;
        }
      }

      return;
    } else {
      this.lastChunkVisited = currentChunkKey;
    }

    // Queue chunk updates in a radius around the player
    // Increased range to ensure good coverage of the mountain
    for (let k = i - this.maxDistance + 1; k <= i + this.maxDistance + 1; k++) {
      for (
        let w = j - this.maxDistance + 1;
        w <= j + this.maxDistance + 1;
        w++
      ) {
        const key = `${k}|${w}`;
        const chunk = this.chunks[key];

        if (this.isOutOfRange(k, w, [i, j])) {
          if (chunk) {
            // Skip removing central mountain chunks - always keep them
            const distFromCenter = Math.sqrt(k*k + w*w);
            if (distFromCenter <= 2) continue;
            
            // Remove physics before disposing chunk
            if (this.activePhysicsChunks.has(key) && this.physicsWorld) {
              this.physicsWorld.removeHeightfield(chunk);
              this.activePhysicsChunks.delete(key);
            }
            this.disposeChunk(chunk, key);
          }
          continue;
        }

        _V.set(k - i, w - j);
        const LOD = this.getLODbyCoords(k, w);

        const indexOf = this.pool.findIndex((el) => el.id === key);
        let el;

        if (chunk === undefined) {
          el = {
            key,
            coords: [k, w],
            LOD,
            callback: () => this.createChunk(k, w, LOD),
          };
        } else {
          el = {
            id: key,
            LOD: LOD,
            coords: [k, w],
            callback: () => {
              chunk.updateLOD(LOD);
              // Update physics for this chunk if needed
              const distFromCenter = Math.sqrt(k*k + w*w);
              if ((LOD <= 1 || distFromCenter <= 2) && !this.activePhysicsChunks.has(key) && this.physicsWorld) {
                this.physicsWorld.addHeightfieldFromChunk(chunk);
                this.activePhysicsChunks.add(key);
              }
            },
          };
        }

        if (indexOf >= 0) {
          this.pool[indexOf] = el;
        } else {
          this.pool.push(el);
        }
      }
    }
  }

  disposeChunk(chunk, key) {
    // Don't dispose the center chunks with the mountain
    if (chunk.coords) {
      const distFromCenter = Math.sqrt(chunk.coords[0]**2 + chunk.coords[1]**2);
      if (distFromCenter <= 2) {
        return; // Keep central mountain chunks
      }
    }
    
    chunk.dispose();
    this.chunks[key] = undefined;
    this.chunkKeys = this.chunkKeys.filter(k => k !== key);
  }

  onParamsChange(LOD) {
    for (const key in this.chunks) {
      const chunk = this.chunks[key];
      if (!chunk) continue;
      
      if (LOD) {
        this.pool.push({
          coords: [0, 0],
          callback: () => chunk.updateLOD(LOD),
        });
      } else {
        this.pool.push({
          coords: [0, 0],
          callback: () => {
            chunk.updateGeometry();
            // Update physics body if necessary
            if (this.activePhysicsChunks.has(key) && this.physicsWorld) {
              this.physicsWorld.removeHeightfield(chunk);
              this.physicsWorld.addHeightfieldFromChunk(chunk);
            }
          },
        });
      }
    }
  }

  getCoordsByTarget() {
    // Use target position (ball) to determine which chunks to load
    const [x, , z] = this.target.position;
    const i = Math.floor(x / this.chunkSize);
    const j = Math.floor(z / this.chunkSize);

    return [i, j];
  }
  
  // Find the highest point on the mountain for placing the ball
  findMountainPeak() {
    // First check if we have the center chunk loaded
    const centerChunk = this.chunks['0|0'];
    if (!centerChunk || !centerChunk.geometry) {
      console.warn("Center chunk not loaded yet, estimating mountain peak position");
      // Use getHeight to estimate the peak height at the center
      return this.findPeakWithNoiseFunction();
    }
    
    // Search through the center chunk geometry to find the highest point
    const positions = centerChunk.geometry.getAttribute('position');
    let maxHeight = 0;
    let peakX = 0;
    let peakZ = 0;
    
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      if (y > maxHeight) {
        maxHeight = y;
        peakX = positions.getX(i) + centerChunk.position.x;
        peakZ = positions.getZ(i) + centerChunk.position.z;
      }
    }
    
    console.log(`Found peak at x:${peakX}, y:${maxHeight}, z:${peakZ} in center chunk geometry`);
    
    // Do a more precise search around this point
    return this.refinePeakLocation(peakX, maxHeight, peakZ);
  }
  
  // Use noise function directly to find the peak
  findPeakWithNoiseFunction() {
    const searchRadius = this.chunkSize / 4;
    const searchStep = searchRadius / 10;
    let maxHeight = 0;
    let peakX = 0;
    let peakZ = 0;
    
    // Search around the center point
    for (let x = -searchRadius; x <= searchRadius; x += searchStep) {
      for (let z = -searchRadius; z <= searchRadius; z += searchStep) {
        const height = getHeight(x, z, this.noise, this.params);
        if (height > maxHeight) {
          maxHeight = height;
          peakX = x;
          peakZ = z;
        }
      }
    }
    
    console.log(`Found peak at x:${peakX}, y:${maxHeight}, z:${peakZ} using noise function`);
    return new Vector3(peakX, maxHeight + 3, peakZ);
  }
  
  // Refine peak location with higher precision
  refinePeakLocation(startX, startY, startZ) {
    const searchRadius = 10;
    const searchStep = 1;
    let maxHeight = startY;
    let peakX = startX;
    let peakZ = startZ;
    
    // Do a finer search around the initial peak
    for (let x = startX - searchRadius; x <= startX + searchRadius; x += searchStep) {
      for (let z = startZ - searchRadius; z <= startZ + searchRadius; z += searchStep) {
        const height = getHeight(x, z, this.noise, this.params);
        if (height > maxHeight) {
          maxHeight = height;
          peakX = x;
          peakZ = z;
        }
      }
    }
    
    console.log(`Refined peak at x:${peakX}, y:${maxHeight}, z:${peakZ}`);
    return new Vector3(peakX, maxHeight + 3, peakZ);
  }
}