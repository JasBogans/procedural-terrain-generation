import * as THREE from 'three';
import SimpleBall from './SimpleBall';
import SimplePhysicsWorld from './SimplePhysicsWorld';

export default class SimpleScene {
  constructor(renderer, sharedCamera) {
    this.scene = new THREE.Scene();
    this.renderer = renderer;
    this.sharedCamera = sharedCamera;
    this.active = false;

    // Set up scene fog and background
    this.scene.fog = new THREE.Fog(0x87CEEB, 200, 500);
    this.scene.background = new THREE.Color(0x87CEEB);
    
    // Input direction for ball control
    this.inputDirection = new THREE.Vector2(0, 0);
    
    // Create physics world
    this.physicsWorld = new SimplePhysicsWorld();
    
    // Create visual elements
    this.createVisuals();
    
    // Create ball
    this.ball = new SimpleBall(2, this.physicsWorld);
    this.scene.add(this.ball);
    
    // Set up input listeners
    this.setupInputListeners();
    
    // Create the instructions element
    this.createInstructions();
    
    // Prepare initial camera position
    this.cameraOffset = new THREE.Vector3(0, 15, -25);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.setupCamera();
  }
  
  createVisuals() {
    // Create ground plane visual
    const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x7CFC00, // Light green
      roughness: 0.7,
      metalness: 0.1
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.position.y = -0.5;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    
    // Create ramped platforms
    this.createRamps();
    
    // Create obstacles
    this.createObstacles();
    
    // Create lights
    this.createLights();
  }
  
  createRamps() {
    // Ramp 1 (matches physics)
    const ramp1Geometry = new THREE.BoxGeometry(20, 1, 20);
    const ramp1Material = new THREE.MeshStandardMaterial({ 
      color: 0x778899,
      roughness: 0.6,
      metalness: 0.2
    });
    const ramp1 = new THREE.Mesh(ramp1Geometry, ramp1Material);
    ramp1.position.set(20, 3, 0);
    ramp1.rotation.z = -Math.PI / 12;
    ramp1.castShadow = true;
    ramp1.receiveShadow = true;
    this.scene.add(ramp1);
    
    // Ramp 2 (matches physics)
    const ramp2Geometry = new THREE.BoxGeometry(20, 1, 20);
    const ramp2Material = new THREE.MeshStandardMaterial({ 
      color: 0x778899,
      roughness: 0.6,
      metalness: 0.2
    });
    const ramp2 = new THREE.Mesh(ramp2Geometry, ramp2Material);
    ramp2.position.set(-20, 3, 0);
    ramp2.rotation.z = Math.PI / 12;
    ramp2.castShadow = true;
    ramp2.receiveShadow = true;
    this.scene.add(ramp2);
    
    // Center platform
    const platformGeometry = new THREE.BoxGeometry(16, 2, 16);
    const platformMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xDDA0DD, // Light purple
      roughness: 0.5,
      metalness: 0.3
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, 2, 0);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.scene.add(platform);
  }
  
  createObstacles() {
    // Create cube obstacles matching the physics objects
    const obstaclePositions = [
      { x: 10, y: 1, z: 10 },
      { x: -10, y: 1, z: -10 },
      { x: 15, y: 1, z: -15 },
      { x: -15, y: 1, z: 15 },
    ];
    
    // Use one geometry for all cubes
    const cubeSize = 4; // Matching the physics size (2 * 2)
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    
    obstaclePositions.forEach((pos, index) => {
      // Create different colored materials for variety
      const colors = [0xF08080, 0x90EE90, 0xADD8E6, 0xFFD700];
      const cubeMaterial = new THREE.MeshStandardMaterial({ 
        color: colors[index % colors.length],
        roughness: 0.7,
        metalness: 0.2,
      });
      
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.set(pos.x, pos.y, pos.z);
      
      // Set random rotation matching the physics objects
      cube.rotation.set(
        Math.random() * Math.PI * 0.2, 
        Math.random() * Math.PI, 
        Math.random() * Math.PI * 0.2
      );
      
      cube.castShadow = true;
      cube.receiveShadow = true;
      this.scene.add(cube);
    });
  }
  
  createLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 200, 100);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    this.scene.add(directionalLight);
  }
  
  setupInputListeners() {
    // Keyboard event listeners
    document.addEventListener('keydown', (e) => {
      if (!this.active) return; // Only process when scene is active
      
      switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputDirection.y = 1;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputDirection.y = -1;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputDirection.x = 1;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputDirection.x = -1;
          break;
        case 'KeyR': // Reset ball position
          this.ball.reset();
          break;
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (!this.active) return; // Only process when scene is active
      
      switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyS':
        case 'ArrowDown':
          this.inputDirection.y = 0;
          break;
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyD':
        case 'ArrowRight':
          this.inputDirection.x = 0;
          break;
      }
    });
  }
  
  createInstructions() {
    // Create instruction overlay for this scene
    const instructionsEl = document.createElement('div');
    instructionsEl.id = 'simple-ball-instructions';
    instructionsEl.className = 'instructions hidden';
    instructionsEl.innerHTML = `
      <div class="instruction-panel">
        <h3>Simple Ball Physics</h3>
        <p>Use arrow keys or WASD to push the ball around.</p>
        <p>Press R to reset ball position.</p>
      </div>
    `;
    document.body.appendChild(instructionsEl);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .instructions {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 15px;
        border-radius: 10px;
        font-family: sans-serif;
        text-align: center;
        z-index: 1000;
        transition: opacity 0.3s;
        pointer-events: none;
      }
      
      .instructions h3 {
        margin-top: 0;
        margin-bottom: 10px;
      }
      
      .instructions p {
        margin: 8px 0;
      }
      
      .hidden {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }
  
  setupCamera() {
    // Position camera for this scene
    this.idealCameraPosition = new THREE.Vector3();
    this.idealCameraPosition.copy(this.ball.position).add(this.cameraOffset);
    
    // If using shared camera, update it now
    if (this.sharedCamera) {
      this.sharedCamera.position.copy(this.idealCameraPosition);
      this.sharedCamera.lookAt(this.ball.position);
    }
  }
  
  // Update position of camera to follow the ball
  updateCamera(deltaTime) {
    if (!this.sharedCamera || !this.active) return;
    
    // Calculate ideal camera position (follow ball)
    this.idealCameraPosition.copy(this.ball.position).add(this.cameraOffset);
    
    // Smoothly move camera to ideal position
    this.sharedCamera.position.lerp(this.idealCameraPosition, deltaTime * 2);
    
    // Look at the ball
    this.cameraTarget.copy(this.ball.position);
    this.sharedCamera.lookAt(this.cameraTarget);
  }
  
  update(deltaTime) {
    if (!this.active) return;
    
    // Update physics world
    this.physicsWorld.update(deltaTime);
    
    // Update ball
    this.ball.update(deltaTime, this.inputDirection);
    
    // Update camera
    this.updateCamera(deltaTime);
  }
  
  activate(useSharedCamera = true) {
    this.active = true;
    
    // Show this scene's instructions
    document.getElementById('simple-ball-instructions').classList.remove('hidden');
    
    if (useSharedCamera) {
      this.setupCamera();
    }
  }
  
  deactivate() {
    this.active = false;
    
    // Hide this scene's instructions
    document.getElementById('simple-ball-instructions').classList.add('hidden');
  }
  
  handleResize(width, height) {
    // Any resize handling specific to this scene
  }
  
  dispose() {
    // Cleanup physics
    this.physicsWorld.dispose();
    
    // Dispose of ball
    this.ball.dispose();
    
    // Dispose of geometries and materials
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    // Clear scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    
    // Remove instructions element
    const instructionsEl = document.getElementById('simple-ball-instructions');
    if (instructionsEl) instructionsEl.remove();
  }
}