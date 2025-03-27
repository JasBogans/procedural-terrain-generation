import { Vector2, Vector3 } from 'three';
import Chunk from './chunk';
import { createNoise2D } from 'simplex-noise';

const _V = new Vector2(0, 0);
const isMobile = window.innerWidth < 768;

export default class ChunkManager {
  chunks = {};
  chunkKeys = [];
  lastChunkVisited = null;
  pool = [];
  maxDistance = isMobile ? 3 : 4; // Reduced distance for better performance
  activePhysicsChunks = new Set();

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
    const [i, j] = this.getCoordsByTarget();
    this.updateChunks();
  }

  getLODbyCoords(k, w) {
    const [i, j] = this.getCoordsByTarget();
    // Faster LOD falloff for stylized terrain
    return Math.floor(_V.set(k - i, w - j).length() * 0.9);
  }

  isOutOfRange(k, w, [i, j]) {
    const distance = _V.set(k - i, w - j).length();
    return distance > this.maxDistance;
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
      
      // Add physics for close chunks
      if (this.physicsWorld && LOD <= 1) {
        this.physicsWorld.addHeightfieldFromChunk(chunk);
        this.activePhysicsChunks.add(`${i}|${j}`);
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
              if (LOD <= 1 && !this.activePhysicsChunks.has(key) && this.physicsWorld) {
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
}