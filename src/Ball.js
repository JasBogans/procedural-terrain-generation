import {
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Vector3,
  Object3D,
  MathUtils,
  TorusGeometry,
  IcosahedronGeometry
} from 'three';
import * as CANNON from 'cannon-es';

export default class Ball extends Object3D {
  velocity = new Vector3(0, 0, 0);
  acceleration = new Vector3(0, -9.8, 0); // Gravity
  onGround = false;
  trailPositions = [];
  maxTrailLength = 20;
  
  constructor(radius = 1, world) {
    super();
    this.radius = radius;
    this.world = world;
    
    // Create the visual representation - low-poly style matching reference
    // Use icosahedron for more low-poly faceted look
    const geometry = new IcosahedronGeometry(radius, 1); // Lower subdivision for faceted look
    const material = new MeshStandardMaterial({
      color: 0xFF4136, // Bright red like in reference
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true
    });
    
    this.mesh = new Mesh(geometry, material);
    this.add(this.mesh);
    
    // Create white ring around ball like in reference
    // const ringGeometry = new TorusGeometry(radius * 1.2, radius * 0.15, 8, 12);
    // const ringMaterial = new MeshStandardMaterial({
    //   color: 0xFFFFFF,
    //   roughness: 0.4,
    //   metalness: 0.2,
    //   flatShading: true
    // });
    
    // this.ring = new Mesh(ringGeometry, ringMaterial);
    // this.ring.rotation.x = Math.PI / 2;
    // this.add(this.ring);
    
    // Create physics body
    this.initPhysics();
  }
  
  initPhysics() {
    // Create a physics body
    this.body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Sphere(this.radius),
      position: new CANNON.Vec3(0, 50, 0), // Start higher up
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.2
      })
    });
    
    // Add damping to make the ball movement more realistic
    this.body.linearDamping = 0.1;
    this.body.angularDamping = 0.2;
    
    // Add the body to the world
    this.world.addBody(this.body);
  }
  
  applyForce(force) {
    if (!this.body) return;
    
    this.body.applyForce(
      new CANNON.Vec3(force.x, force.y, force.z),
      new CANNON.Vec3(0, 0, 0)
    );
  }
  
  checkGroundContact() {
    if (!this.body) return false;
    
    // Cast a ray from the ball center downward
    const start = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
    const end = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y - (this.radius + 0.2), // Just below the ball
      this.body.position.z
    );
    
    // Perform the raycast
    const result = new CANNON.RaycastResult();
    this.world.raycastClosest(start, end, {}, result);
    
    // If the ray hit something, we're on or near the ground
    this.isOnGround = result.hasHit;
    return this.isOnGround;
  }
  
  update(dt, inputDirection) {
    if (!this.body) return;
    
    // Apply player input if on ground
    if (this.checkGroundContact() && inputDirection.lengthSq() > 0) {
      // Get current movement direction
      const currentDir = new Vector3(
        this.body.velocity.x,
        0,
        this.body.velocity.z
      ).normalize();
      
      // Calculate forward and right directions relative to camera
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
      
      // Apply the force - stronger force for going uphill
      const force = new Vector3(
        forceDirection.x * 25, 
        0,
        forceDirection.z * 25
      );
      
      this.applyForce(force);
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
    
    // Keep the ring level with horizon for visual effect
    // This creates a stylized effect like in the reference image
    // Use a simpler approach to keep the ring horizontal
    // this.ring.rotation.setFromQuaternion(this.quaternion);
    // this.ring.rotation.x = Math.PI / 2;
    
    // Maintain trail for effects
    this.updateTrail();
  }
  
  updateTrail() {
    // Add current position to trail
    if (this.trailPositions.length >= this.maxTrailLength) {
      this.trailPositions.shift();
    }
    this.trailPositions.push(this.position.clone());
  }
  
  reset(position) {
    // Reset the ball position
    if (this.body) {
      this.body.position.set(position.x, position.y, position.z);
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
      this.body.force.set(0, 0, 0);
      this.body.torque.set(0, 0, 0);
    }
    this.trailPositions = [];
  }
}