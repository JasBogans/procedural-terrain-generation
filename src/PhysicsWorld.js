import * as CANNON from 'cannon-es';
import { Vector3 } from 'three';

export default class PhysicsWorld {
  constructor() {
    // Create physics world with standard gravity
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    
    // Configure solver with balanced settings
    this.world.solver.iterations = 10;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    
    // Create materials
    this.groundMaterial = new CANNON.Material('ground');
    this.ballMaterial = new CANNON.Material('ball');
    
    // Create contact material with good friction and minimal bounce
    const ballGroundContact = new CANNON.ContactMaterial(
      this.ballMaterial,
      this.groundMaterial,
      {
        friction: 0.7,
        restitution: 0.1
      }
    );
    
    this.world.addContactMaterial(ballGroundContact);
    
    // Keep track of bodies
    this.physicsBodies = new Map();
    this.debugMode = false;
    
    // Create safety ground plane far below to catch anything that falls through
    this.createSafetyGround();
  }
  
  createSafetyGround() {
    // Create a ground plane far below to catch anything that falls through terrain
    const safetyGround = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(0, -100, 0),
      shape: new CANNON.Plane(),
      material: this.groundMaterial
    });
    
    // Rotate to face upward
    safetyGround.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI/2
    );
    
    this.world.addBody(safetyGround);
  }
  
  update(dt) {
    // Use fixed timestep for stable simulation
    const fixedTimeStep = 1/60;
    const maxSubSteps = 3;
    
    this.world.step(fixedTimeStep, dt, maxSubSteps);
    
    if (this.debugMode && this.debugBallBody) {
      console.log(`Ball position: ${this.debugBallBody.position.y.toFixed(2)}, velocity: ${this.debugBallBody.velocity.y.toFixed(2)}`);
    }
  }
  
  addHeightfieldFromChunk(chunk) {
    if (!chunk || !chunk.geometry) return null;
    
    // Instead of creating complex heightfields that can cause issues,
    // let's create a simpler collision representation
    
    // Get geometry bounds
    const position = chunk.position;
    const size = chunk.size;
    
    // Find average height in this chunk
    let avgHeight = 0;
    const posAttribute = chunk.geometry.getAttribute('position');
    
    // Sample a subset of positions for performance
    const sampleCount = Math.min(100, posAttribute.count);
    const sampleStep = Math.floor(posAttribute.count / sampleCount);
    
    let highestPoint = -Infinity;
    let highestX = 0, highestZ = 0;
    
    for (let i = 0; i < posAttribute.count; i += sampleStep) {
      const y = posAttribute.getY(i);
      avgHeight += y;
      
      // Track highest point for ball placement
      if (y > highestPoint) {
        highestPoint = y;
        highestX = posAttribute.getX(i) + position.x;
        highestZ = posAttribute.getZ(i) + position.z;
      }
    }
    
    avgHeight /= (posAttribute.count / sampleStep);
    
    // Store highest point in chunk for future reference
    chunk.highestPoint = {
      x: highestX,
      y: highestPoint,
      z: highestZ
    };
    
    // Create a collision box that approximates this terrain chunk
    const halfSize = size / 2;
    const boxShape = new CANNON.Box(new CANNON.Vec3(halfSize, Math.max(20, avgHeight/2), halfSize));
    
    const groundBody = new CANNON.Body({
      mass: 0, // Static body
      position: new CANNON.Vec3(position.x, avgHeight/2 - 1, position.z),
      shape: boxShape,
      material: this.groundMaterial
    });
    
    // Add the body to the world
    this.world.addBody(groundBody);
    
    // Store references
    const chunkId = `${chunk.coords[0]}|${chunk.coords[1]}`;
    this.physicsBodies.set(chunkId, groundBody);
    chunk.physicsBody = groundBody;
    
    if (this.debugMode) {
      console.log(`Created physics for chunk at ${chunk.coords[0]},${chunk.coords[1]} with avg height ${avgHeight.toFixed(2)}`);
    }
    
    return groundBody;
  }
  
  removeHeightfield(chunk) {
    if (!chunk) return;
    
    // Remove physics body
    if (chunk.physicsBody) {
      this.world.removeBody(chunk.physicsBody);
      chunk.physicsBody = null;
    }
    
    // Clean up references
    if (chunk.coords) {
      const chunkId = `${chunk.coords[0]}|${chunk.coords[1]}`;
      const body = this.physicsBodies.get(chunkId);
      if (body) {
        this.world.removeBody(body);
        this.physicsBodies.delete(chunkId);
      }
    }
  }
  
  createBall(radius, position) {
    // Create ball with simplified physics properties
    const sphereShape = new CANNON.Sphere(radius);
    
    const body = new CANNON.Body({
      mass: 5,
      shape: sphereShape,
      material: this.ballMaterial,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.1,
      angularDamping: 0.2,
      allowSleep: false
    });
    
    // Add to world
    this.world.addBody(body);
    this.debugBallBody = body;
    
    return body;
  }
  
  createSphereTrigger(position, radius, callback) {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape,
      isTrigger: true
    });
    
    body.addEventListener('collide', callback);
    this.world.addBody(body);
    return body;
  }
  
  createBoxTrigger(position, size, callback) {
    const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
    const body = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape,
      isTrigger: true
    });
    
    body.addEventListener('collide', callback);
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