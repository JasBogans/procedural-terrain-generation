import {
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Vector3,
  Object3D,
  MathUtils,
  IcosahedronGeometry,
  Raycaster
} from 'three';
import * as CANNON from 'cannon-es';

export default class Ball extends Object3D {
  velocity = new Vector3(0, 0, 0);
  onGround = false;
  trailPositions = [];
  maxTrailLength = 20;
  lastSafePosition = new Vector3();
  
  constructor(radius = 1, physicsWorld) {
    super();
    this.radius = radius;
    this.physicsWorld = physicsWorld;
    
    // Create the visual representation - low-poly style
    const geometry = new IcosahedronGeometry(radius, 1);
    const material = new MeshStandardMaterial({
      color: 0xFF4136,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true
    });
    
    this.mesh = new Mesh(geometry, material);
    this.add(this.mesh);
    
    // Create physics body
    this.initPhysics();
  }
  
  initPhysics() {
    if (!this.physicsWorld) {
      console.error("Physics world not provided to Ball");
      return;
    }
    
    // Start at a high position above the terrain
    const startPosition = new Vector3(0, 100, 0);
    this.body = this.physicsWorld.createBall(this.radius, startPosition);
    
    if (!this.body) {
      console.error("Failed to create ball physics body");
      return;
    }
    
    // Set up collision callback
    this.body.addEventListener("collide", this.handleCollision.bind(this));
    
    // Initial position sync
    this.position.copy(startPosition);
    this.lastSafePosition.copy(startPosition);
    
    // Create raycaster for ground detection
    this.raycaster = new Raycaster();
    this.downDirection = new Vector3(0, -1, 0);
  }
  
  handleCollision(event) {
    const { body } = event;
    
    if (body.mass === 0) { // Static body = terrain
      this.onGround = true;
      // Save last known safe position when in contact with ground
      this.lastSafePosition.copy(this.position);
    }
  }
  
  applyForce(force) {
    if (!this.body) return;
    
    // Apply force to the center of mass
    this.body.applyForce(
      new CANNON.Vec3(force.x, force.y, force.z),
      new CANNON.Vec3(0, 0, 0)
    );
  }
  
  update(dt, inputDirection) {
    if (!this.body) return;
    
    // Apply player input if on ground
    if (this.onGround && inputDirection.lengthSq() > 0) {
      // Calculate directions relative to camera
      const cameraDirection = this.getWorldDirection(new Vector3());
      cameraDirection.y = 0;
      cameraDirection.normalize();
      
      const forward = cameraDirection.clone();
      const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward);
      
      // Combine input direction with camera orientation
      const forceDirection = new Vector3();
      forceDirection.addScaledVector(forward, inputDirection.y);
      forceDirection.addScaledVector(right, inputDirection.x);
      forceDirection.normalize();
      
      // Apply force with strength that works with simplified physics
      const forceMultiplier = 15; 
      
      const force = new Vector3(
        forceDirection.x * forceMultiplier, 
        0,
        forceDirection.z * forceMultiplier
      );
      
      this.applyForce(force);
      
      // Add small upward boost for uphill movement
      if (this.body.velocity.y < 0) {
        this.body.applyForce(
          new CANNON.Vec3(0, 3, 0),
          new CANNON.Vec3(0, 0, 0)
        );
      }
    }
    
    // Apply speed limit for stability
    const horizontalVelocity = new CANNON.Vec3(
      this.body.velocity.x,
      0,
      this.body.velocity.z
    );
    const horizontalSpeed = horizontalVelocity.length();
    const maxSpeed = 30;
    
    if (horizontalSpeed > maxSpeed) {
      const scale = maxSpeed / horizontalSpeed;
      this.body.velocity.x *= scale;
      this.body.velocity.z *= scale;
    }
    
    // Update visual mesh position to match physics body
    this.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
    
    // Update rotation
    this.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w
    );
    
    // Check for falling through terrain
    this.checkSafety();
    
    // Reset ground flag after air time
    if (this.body.velocity.y > 0.5) {
      this.onGround = false;
    }
    
    // Maintain trail for visual effects
    this.updateTrail();
  }
  
  checkSafety() {
    // Safety check - if ball falls below a certain threshold or is falling too fast
    if (this.position.y < -50) {
      console.log("Ball fell below threshold, resetting to safe position");
      this.reset(this.lastSafePosition.clone());
      return;
    }
    
    // Additional check for excessive velocity
    const velocity = this.body.velocity;
    const speedY = Math.abs(velocity.y);
    
    if (speedY > 40) {
      console.log("Excessive vertical velocity detected, dampening");
      this.body.velocity.y *= 0.5;
    }
  }
  
  updateTrail() {
    // Add current position to trail
    if (this.trailPositions.length >= this.maxTrailLength) {
      this.trailPositions.shift();
    }
    this.trailPositions.push(this.position.clone());
  }
  
  reset(position) {
    // Reset the ball position and physics state
    if (this.body) {
      this.body.position.set(position.x, position.y, position.z);
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
      this.body.force.set(0, 0, 0);
      this.body.torque.set(0, 0, 0);
      this.body.wakeUp();
    }
    
    this.position.copy(position);
    this.lastSafePosition.copy(position);
    this.trailPositions = [];
    this.onGround = false;
  }
  
  dispose() {
    if (this.body && this.physicsWorld && this.physicsWorld.world) {
      this.physicsWorld.world.removeBody(this.body);
    }
    
    this.geometry?.dispose();
    this.material?.dispose();
  }
}