import * as CANNON from 'cannon-es';
import { Vector3 } from 'three';

export default class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0) // Earth gravity
    });
    
    // Configure solver for more stable simulation
    this.world.solver.iterations = 10;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    
    // Contact material properties
    this.groundMaterial = new CANNON.Material('ground');
    this.ballMaterial = new CANNON.Material('ball');
    
    // Create contact behavior between ball and ground
    const ballGroundContact = new CANNON.ContactMaterial(
      this.ballMaterial,
      this.groundMaterial,
      {
        friction: 0.4,        // More friction for stylized mountain
        restitution: 0.2      // Slightly bouncy
      }
    );
    
    this.world.addContactMaterial(ballGroundContact);
    
    // Track bodies for cleanup
    this.physicsBodies = new Map();
  }
  
  update(dt) {
    // Step the physics simulation forward
    this.world.step(1/60, dt, 3);
  }
  
  addHeightfieldFromChunk(chunk) {
    // Skip if chunk doesn't exist
    if (!chunk || !chunk.geometry) return null;
    
    // This function creates a heightfield shape from a Three.js terrain chunk
    const geometry = chunk.geometry;
    const position = chunk.position;
    
    const posAttribute = geometry.getAttribute('position');
    
    // Calculate segments from position count (approx square root)
    const segmentsX = Math.round(Math.sqrt(posAttribute.count) - 1);
    const segmentsZ = segmentsX;
    
    // Create a 2D array to store the height data
    const heightData = [];
    
    // Extract the height data
    for (let z = 0; z <= segmentsZ; z++) {
      const row = [];
      for (let x = 0; x <= segmentsX; x++) {
        const index = z * (segmentsX + 1) + x;
        if (index < posAttribute.count) {
          // Get height from geometry
          const height = posAttribute.getY(index);
          row.push(height);
        } else {
          console.warn("Index out of bounds when building heightfield", index, posAttribute.count);
          // Fallback - use previous height or 0
          row.push(row.length > 0 ? row[row.length - 1] : 0);
        }
      }
      heightData.push(row);
    }
    
    // Safety check for empty heightData
    if (heightData.length === 0 || heightData[0].length === 0) {
      console.warn("Empty height data for chunk, skipping physics creation");
      return null;
    }
    
    // Create a heightfield shape
    const heightfieldShape = new CANNON.Heightfield(heightData, {
      elementSize: chunk.size / segmentsX
    });
    
    // Create a body for the heightfield
    const heightfieldBody = new CANNON.Body({
      mass: 0, // Static body
      shape: heightfieldShape,
      material: this.groundMaterial
    });
    
    // Position the heightfield body
    // Heightfield is centered on its local x-z plane, so we need to adjust position
    const sizeX = chunk.size;
    const sizeZ = chunk.size;
    heightfieldBody.position.set(
      position.x - sizeX / 2,
      position.y,
      position.z - sizeZ / 2
    );
    
    // Rotate to align with Three.js coordinate system
    heightfieldBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI / 2
    );
    
    // Add the body to the world
    this.world.addBody(heightfieldBody);
    
    // Store a reference to the body 
    const chunkId = `${chunk.coords[0]}|${chunk.coords[1]}`;
    this.physicsBodies.set(chunkId, heightfieldBody);
    chunk.physicsBody = heightfieldBody;
    
    return heightfieldBody;
  }
  
  removeHeightfield(chunk) {
    if (!chunk) return;
    
    // Get the physics body for this chunk
    if (chunk.physicsBody) {
      this.world.removeBody(chunk.physicsBody);
      chunk.physicsBody = null;
    }
    
    // Also try to remove by ID in case the reference was lost
    if (chunk.coords) {
      const chunkId = `${chunk.coords[0]}|${chunk.coords[1]}`;
      const body = this.physicsBodies.get(chunkId);
      if (body) {
        this.world.removeBody(body);
        this.physicsBodies.delete(chunkId);
      }
    }
  }
  
  createSphereTrigger(position, radius, callback) {
    // Create a non-physical trigger sphere
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape,
      isTrigger: true
    });
    
    // Add event handler for collisions
    body.addEventListener('collide', callback);
    
    // Add to world
    this.world.addBody(body);
    return body;
  }
  
  createBoxTrigger(position, size, callback) {
    // Create a non-physical trigger box
    const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
    const body = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape,
      isTrigger: true
    });
    
    // Add event handler for collisions
    body.addEventListener('collide', callback);
    
    // Add to world
    this.world.addBody(body);
    return body;
  }
  
  cleanup() {
    // Remove all bodies from the world
    for (const body of this.physicsBodies.values()) {
      this.world.removeBody(body);
    }
    this.physicsBodies.clear();
  }
}