import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export default class SimplePhysicsWorld {
  constructor() {
    // Initialize physics world
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0), // Earth gravity
    });
    
    // Enable sleeping for better performance
    this.world.allowSleep = true;
    
    // Collection of physics bodies
    this.physicsBodies = [];
    
    // Materials
    this.groundMaterial = new CANNON.Material('ground');
    this.ballMaterial = new CANNON.Material('ball');
    
    // Contact materials
    this.createContactMaterials();
    
    // Collision event handling
    this.setupCollisionEvents();
    
    // Physics barriers and ground
    this.createGround();
    this.createBoundaries();
  }
  
  createContactMaterials() {
    // Ground-to-ball contact (bouncy but with friction)
    const groundBallContactMaterial = new CANNON.ContactMaterial(
      this.groundMaterial, 
      this.ballMaterial, 
      {
        friction: 0.3,        // Friction coefficient
        restitution: 0.6,     // Bounciness
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
      }
    );
    
    // Register this contact material
    this.world.addContactMaterial(groundBallContactMaterial);
  }
  
  setupCollisionEvents() {
    // Add collision detection
    this.world.addEventListener('beginContact', (event) => {
      // Custom impact effect could be added here
      // Only process if both bodies have userData
      if (event.bodyA.userData && event.bodyB.userData) {
        // Handle specific collision types here
      }
    });
  }
  
  createGround() {
    // Create ground plane
    const groundShape = new CANNON.Box(new CANNON.Vec3(50, 0.5, 50));
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.groundMaterial,
      shape: groundShape,
    });
    
    // Set ground position slightly below y=0
    groundBody.position.set(0, -0.5, 0);
    
    // Add ground to world
    this.world.addBody(groundBody);
    this.physicsBodies.push(groundBody);
    
    // Add some ramps and obstacles
    this.addObstacles();
  }
  
  addObstacles() {
    // Add a few ramps and obstacles to make the scene more interesting
    
    // Ramp 1
    const ramp1 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.groundMaterial,
    });
    const ramp1Shape = new CANNON.Box(new CANNON.Vec3(10, 0.5, 10));
    ramp1.addShape(ramp1Shape);
    ramp1.position.set(20, 3, 0);
    ramp1.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -Math.PI / 12); // Tilt
    this.world.addBody(ramp1);
    this.physicsBodies.push(ramp1);
    
    // Ramp 2
    const ramp2 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.groundMaterial,
    });
    const ramp2Shape = new CANNON.Box(new CANNON.Vec3(10, 0.5, 10));
    ramp2.addShape(ramp2Shape);
    ramp2.position.set(-20, 3, 0);
    ramp2.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 12); // Tilt opposite
    this.world.addBody(ramp2);
    this.physicsBodies.push(ramp2);
    
    // Center platform (higher)
    const platform = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.groundMaterial,
    });
    const platformShape = new CANNON.Box(new CANNON.Vec3(8, 1, 8));
    platform.addShape(platformShape);
    platform.position.set(0, 2, 0);
    this.world.addBody(platform);
    this.physicsBodies.push(platform);
    
    // Add a few cube obstacles
    const obstaclePositions = [
      { x: 10, y: 1, z: 10 },
      { x: -10, y: 1, z: -10 },
      { x: 15, y: 1, z: -15 },
      { x: -15, y: 1, z: 15 },
    ];
    
    obstaclePositions.forEach(pos => {
      const obstacle = new CANNON.Body({
        mass: 0, // Static
        material: this.groundMaterial,
      });
      
      const size = 2; // 2x2x2 cube
      const obstacleShape = new CANNON.Box(new CANNON.Vec3(size, size, size));
      obstacle.addShape(obstacleShape);
      obstacle.position.set(pos.x, pos.y, pos.z);
      
      // Random rotation
      obstacle.quaternion.setFromEuler(
        Math.random() * Math.PI * 0.2, 
        Math.random() * Math.PI, 
        Math.random() * Math.PI * 0.2
      );
      
      this.world.addBody(obstacle);
      this.physicsBodies.push(obstacle);
    });
  }
  
  createBoundaries() {
    // Create invisible walls to keep the ball on the platform
    const wallHeight = 5;
    const wallThickness = 0.5;
    const arenaSize = 50; // Half-width of the arena
    
    // Define wall parameters: position, size, rotation
    const walls = [
      // North wall
      { 
        position: new CANNON.Vec3(0, wallHeight / 2, -arenaSize), 
        size: new CANNON.Vec3(arenaSize, wallHeight / 2, wallThickness),
        rotation: null
      },
      // South wall
      { 
        position: new CANNON.Vec3(0, wallHeight / 2, arenaSize), 
        size: new CANNON.Vec3(arenaSize, wallHeight / 2, wallThickness),
        rotation: null
      },
      // East wall
      { 
        position: new CANNON.Vec3(arenaSize, wallHeight / 2, 0), 
        size: new CANNON.Vec3(wallThickness, wallHeight / 2, arenaSize),
        rotation: null
      },
      // West wall
      { 
        position: new CANNON.Vec3(-arenaSize, wallHeight / 2, 0), 
        size: new CANNON.Vec3(wallThickness, wallHeight / 2, arenaSize),
        rotation: null
      }
    ];
    
    // Create each wall
    walls.forEach(wall => {
      const wallBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: this.groundMaterial,
      });
      
      const wallShape = new CANNON.Box(wall.size);
      wallBody.addShape(wallShape);
      wallBody.position.copy(wall.position);
      
      if (wall.rotation) {
        wallBody.quaternion.copy(wall.rotation);
      }
      
      this.world.addBody(wallBody);
      this.physicsBodies.push(wallBody);
    });
  }
  
  // Create a physics body that triggers a callback but doesn't affect physics
  createSphereTrigger(position, radius, callback) {
    const triggerShape = new CANNON.Sphere(radius);
    const triggerBody = new CANNON.Body({
      isTrigger: true, // Mark as trigger (ghost object)
      type: CANNON.Body.STATIC,
    });
    
    triggerBody.addShape(triggerShape);
    triggerBody.position.copy(position);
    
    // Store callback in userData
    triggerBody.userData = {
      isTrigger: true,
      callback: callback,
    };
    
    // Add collision event
    triggerBody.addEventListener('collide', (event) => {
      if (triggerBody.userData && triggerBody.userData.callback) {
        triggerBody.userData.callback(event);
      }
    });
    
    this.world.addBody(triggerBody);
    this.physicsBodies.push(triggerBody);
    
    return triggerBody;
  }
  
  update(deltaTime) {
    // Cap delta time to prevent large jumps
    const timeStep = Math.min(deltaTime, 1/60);
    
    // Fixed timestep for stability
    this.world.step(timeStep);
  }
  
  dispose() {
    // Remove all bodies from the world
    this.physicsBodies.forEach(body => {
      this.world.removeBody(body);
    });
    
    // Clear references for GC
    this.physicsBodies = [];
  }
}