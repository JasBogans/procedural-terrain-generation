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

export default class SimpleBall extends Object3D {
  constructor(radius = 2, physicsWorld) {
    super();
    this.radius = radius;
    this.physicsWorld = physicsWorld;
    this.onGround = false;
    this.jumpCooldown = 0;
    
    // Create the visual representation - low-poly style to match the main Ball
    const geometry = new IcosahedronGeometry(radius, 1);
    const material = new MeshStandardMaterial({
      color: 0xFF4136, // Same red color as the main ball
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true
    });
    
    this.mesh = new Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.add(this.mesh);
    
    // Create physics body if physics world is provided
    if (physicsWorld) {
      this.initPhysics();
    }
  }
  
  initPhysics() {
    // Start at a position slightly above the ground
    const startPosition = new Vector3(0, this.radius + 5, 0);
    
    // Create a sphere body
    const sphereShape = new CANNON.Sphere(this.radius);
    this.body = new CANNON.Body({
      mass: 5, // Mass of 5 kg
      shape: sphereShape,
      position: new CANNON.Vec3(startPosition.x, startPosition.y, startPosition.z),
      material: this.physicsWorld.ballMaterial,
      linearDamping: 0.3, // More damping for smoother movement
      angularDamping: 0.3
    });
    
    // Add to physics world
    this.physicsWorld.world.addBody(this.body);
    
    // Initial position sync
    this.position.copy(startPosition);

    // Add ground detection
    this.setupGroundDetection();
  }
  
  setupGroundDetection() {
    // Create raycaster for ground detection
    this.raycaster = new Raycaster();
    this.downDirection = new Vector3(0, -1, 0);
  }
  
  checkGround() {
    if (!this.raycaster) return false;
    
    // Start raycast from slightly above the ball to avoid self-intersection
    const rayStart = this.position.clone();
    rayStart.y += 0.1;
    
    // Set raycaster
    this.raycaster.set(rayStart, this.downDirection);
    
    // Find all objects in the scene
    const intersects = this.raycaster.intersectObjects(
      this.parent?.children || [], 
      true
    );
    
    // Check if we hit something within radius + small buffer distance
    const groundDistance = this.radius + 0.3;
    return intersects.length > 0 && intersects[0].distance < groundDistance;
  }
  
  jump() {
    if (!this.body || this.jumpCooldown > 0) return;
    
    // Only jump if the ball is on or near the ground
    if (this.onGround) {
      // Apply an upward impulse
      const jumpForce = 60;
      this.body.applyImpulse(
        new CANNON.Vec3(0, jumpForce, 0),
        new CANNON.Vec3(0, 0, 0)
      );
      
      // Set the ball as no longer on the ground
      this.onGround = false;
      
      // Set a cooldown to prevent jump spamming
      this.jumpCooldown = 0.3; // seconds
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
    
    // Update jump cooldown
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= dt;
    }
    
    // Check if ball is on ground
    this.onGround = this.checkGround();
    
    // Apply player input
    if (inputDirection.lengthSq() > 0) {
      // Calculate force based on input direction
      const forceMultiplier = 60; // Increased from 15 to 40 for more responsive movement
      
      const force = new Vector3(
        inputDirection.x * forceMultiplier, 
        0, 
        inputDirection.y * forceMultiplier
      );
      
      this.applyForce(force);
    }
    
    // Apply maximum speed limit
    const horizontalVelocity = new CANNON.Vec3(
      this.body.velocity.x,
      0,
      this.body.velocity.z
    );
    const horizontalSpeed = horizontalVelocity.length();
    const maxSpeed = 35; // Increased from 30 to 35 to allow for faster movement
    
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
    
    // Reset the ball if it falls off the platform
    if (this.position.y < -20) {
      this.reset();
    }
  }
  
  reset(position = null) {
    // Reset the ball to starting position
    const startPosition = position || new Vector3(0, this.radius + 5, 0);
    
    if (this.body) {
      this.body.position.set(startPosition.x, startPosition.y, startPosition.z);
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
      this.body.force.set(0, 0, 0);
      this.body.torque.set(0, 0, 0);
      this.body.wakeUp();
    }
    
    this.position.copy(startPosition);
  }
  
  dispose() {
    if (this.body && this.physicsWorld && this.physicsWorld.world) {
      this.physicsWorld.world.removeBody(this.body);
    }
    
    this.mesh.geometry?.dispose();
    this.mesh.material?.dispose();
  }
}