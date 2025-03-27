import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as dat from 'lil-gui'
import ChunkManager from './src/chunkManager'
import { getHeight } from './src/heightGenerator'
import Ball from './src/Ball'
import PhysicsWorld from './src/PhysicsWorld'
import gsap from 'gsap'
import * as CANNON from 'cannon-es'

// UI elements
const loadingEl = document.getElementById('loader')
const progressEl = document.getElementById('progress')
const playEl = document.getElementById('play')
const toggleEl = document.getElementById('sound-toggle')
let volume = true
const isMobile = window.innerWidth < 768

// Camera configuration
const cameraOffset = new THREE.Vector3(0, 10, -15)
const cameraTarget = new THREE.Vector3(0, 0, 0)
const cameraLookAt = new THREE.Vector3(0, 0, 0)

// Assets
const assets = {
  soundtrack: null,
}

// Loading manager
const loaderManager = new THREE.LoadingManager()
loaderManager.onLoad = () => {
  console.log('Assets loaded!')

  gsap.set('canvas', { autoAlpha: 0 })

  // Audio toggle
  toggleEl.addEventListener('click', () => {
    volume = !volume
    if (assets.soundtrack) {
      assets.soundtrack.setVolume(volume ? 0.1 : 0)
    }
    gsap.to(toggleEl, { opacity: volume ? 1 : 0.4, duration: 0.2 })
  })

  // Start game
  gsap.to(loadingEl, {
    autoAlpha: 0,
    duration: 1,
    onComplete: () => {
      init(assets)

      gsap.to(playEl, {
        autoAlpha: 1,
        duration: 0.5,
        onComplete: () => {
          playEl.addEventListener('click', () => {
            if (assets.soundtrack) {
              assets.soundtrack.play()
            }
            gsap.to(playEl, { duration: 0.2, autoAlpha: 0 })
            
            // Start the ball rolling with a small push
            if (ball && ball.body) {
              ball.applyForce(new THREE.Vector3(0, 0, 30))
            }
            
            gsap.to('canvas', { autoAlpha: 1, duration: 1, ease: 'power3.out' })
          })
          gsap.to('canvas', { autoAlpha: 1, duration: 3, ease: 'power3.out' })
        },
      })
    },
  })
}

loaderManager.onProgress = (a, i, total) => {
  const progress = (100 * i) / total
  gsap.to(progressEl, { width: `${progress}%`, duration: 1 })
}

loaderManager.onStart = () => {
  gsap.to(loadingEl, { autoAlpha: 1, duration: 0 })
}

// Try to load audio if available
try {
  const audioLoader = new THREE.AudioLoader(loaderManager)
  import('./src/audio/epic-soundtrack.mp3').then(module => {
    audioLoader.load(module.default, (buffer) => {
      const listener = new THREE.AudioListener()
      const sound = new THREE.Audio(listener)
      sound.setBuffer(buffer)
      sound.setLoop(true)
      sound.setVolume(0.1)
      assets.soundtrack = sound
      camera.add(listener)
    })
  }).catch(err => console.warn('Audio not loaded'))
} catch (e) {
  console.warn('Error importing audio')
}

/**
 * Terrain and visuals parameters
 */
const params = {
  directionalLight: 5,
  ambientLight: 2,
  amplitude: 35,         // Mountain height
  frequency: {
    x: 0.7,
    z: 0.7,
  },
  xOffset: 0,
  zOffset: 0,
  octaves: 6,            // Detail levels
  lacunarity: 2.2,       // How quickly detail increases
  persistance: 0.55,     // How much detail diminishes
  LOD: 0,
  fog: 0x87CEEB,         // Sky blue fog
}

// Shader uniforms
const uniforms = {
  uTime: { value: 0 },
  uCamera: { value: new THREE.Vector3() },
  uFog: { value: new THREE.Color(params.fog) },
  uRocks: { value: new THREE.Color(0x696969) },
  uGrass: { value: new THREE.Color(0x458B00) },
  uLand: { value: new THREE.Color(0x8B4513) }
};

// GUI for debugging
let gui
if (window.location.hash === '#debug') {
  gui = new dat.GUI()
  
  // Terrain parameters
  const terrainFolder = gui.addFolder('Terrain')
  terrainFolder.add(params, 'amplitude', 20, 50, 1).onChange(() => chunkManager.onParamsChange())
  terrainFolder.add(params, 'octaves', 2, 8, 1).onChange(() => chunkManager.onParamsChange())
  terrainFolder.add(params, 'persistance', 0.1, 0.9, 0.05).onChange(() => chunkManager.onParamsChange())
  terrainFolder.add(params, 'lacunarity', 1.5, 3, 0.1).onChange(() => chunkManager.onParamsChange())
  
  // Lighting parameters
  const lightFolder = gui.addFolder('Lighting')
  lightFolder.add(params, 'directionalLight', 0, 10, 0.1).onChange((val) => directionalLight.intensity = val)
  lightFolder.add(params, 'ambientLight', 0, 10, 0.1).onChange((val) => ambientLight.intensity = val)
}

/**
 * Scene
 */
const scene = new THREE.Scene()

/**
 * Render sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
}

/**
 * Camera
 */
const fov = isMobile ? 70 : 60
const camera = new THREE.PerspectiveCamera(
  fov,
  sizes.width / sizes.height,
  0.1,
  10000
)
camera.position.set(0, 50, -20)
camera.lookAt(cameraTarget)

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
})
document.body.appendChild(renderer.domElement)
handleResize()

/**
 * Controls
 */
// Initially disabled controls, will be enabled when debugging
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enabled = window.location.hash === '#debug'
controls.maxPolarAngle = Math.PI / 2 - 0.1 // Prevent going below ground

// Input handling for ball control
const inputDirection = new THREE.Vector2(0, 0)

document.addEventListener('keydown', (e) => {
  switch(e.code) {
    case 'KeyW':
    case 'ArrowUp':
      inputDirection.y = 1
      break
    case 'KeyS':
    case 'ArrowDown':
      inputDirection.y = -1
      break
    case 'KeyA':
    case 'ArrowLeft':
      inputDirection.x = -1
      break
    case 'KeyD':
    case 'ArrowRight':
      inputDirection.x = 1
      break
    case 'KeyC': // Toggle camera controls for debugging
      controls.enabled = !controls.enabled
      break
    case 'KeyR': // Reset ball position
      if (ball) resetBall()
      break
  }
})

document.addEventListener('keyup', (e) => {
  switch(e.code) {
    case 'KeyW':
    case 'ArrowUp':
    case 'KeyS':
    case 'ArrowDown':
      inputDirection.y = 0
      break
    case 'KeyA':
    case 'ArrowLeft':
    case 'KeyD':
    case 'ArrowRight':
      inputDirection.x = 0
      break
  }
})

// Mobile touch controls
if (isMobile) {
  const touchControls = document.createElement('div')
  touchControls.className = 'touch-controls'
  touchControls.innerHTML = `
    <div class="touch-joystick">
      <div class="touch-stick"></div>
    </div>
    <div class="touch-button reset-button">R</div>
  `
  document.body.appendChild(touchControls)
  
  const joystick = document.querySelector('.touch-joystick')
  const stick = document.querySelector('.touch-stick')
  const resetButton = document.querySelector('.reset-button')
  
  let isDragging = false
  let startX = 0
  let startY = 0
  
  // Joystick controls
  joystick.addEventListener('touchstart', (e) => {
    isDragging = true
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    e.preventDefault()
  })
  
  document.addEventListener('touchmove', (e) => {
    if (isDragging) {
      const touchX = e.touches[0].clientX
      const touchY = e.touches[0].clientY
      
      // Calculate direction vector, normalized to [-1, 1]
      const deltaX = (touchX - startX) / 50
      const deltaY = (touchY - startY) / 50
      
      // Clamp values
      inputDirection.x = Math.max(-1, Math.min(1, deltaX))
      inputDirection.y = Math.max(-1, Math.min(1, -deltaY)) // Invert Y for natural feel
      
      // Update stick visual position
      stick.style.transform = `translate(${deltaX * 20}px, ${deltaY * 20}px)`
      e.preventDefault()
    }
  })
  
  document.addEventListener('touchend', () => {
    isDragging = false
    inputDirection.set(0, 0)
    stick.style.transform = 'translate(0px, 0px)'
  })
  
  // Reset button
  resetButton.addEventListener('touchstart', () => {
    if (ball) resetBall()
  })
}

/**
 * Ball & Physics
 */
let chunkManager, ball, physicsWorld

function init(assets) {
  // Create physics world
  physicsWorld = new PhysicsWorld()
  
  // Create temporary object for chunkManager initialization
  const tempTarget = { position: new THREE.Vector3(0, 50, 0) }
  
  // Create chunk manager for terrain first
  chunkManager = new ChunkManager(
    256, // Chunk size
    tempTarget,
    params,
    scene,
    uniforms,
    assets,
    physicsWorld // Pass physics world to chunk manager
  )
  
  // Now create the ball with access to the noise
  ball = new Ball(1.5, physicsWorld.world)
  
  // Position the ball at a suitable starting point using chunkManager's noise
  const startHeight = Math.max(getHeight(0, 0, chunkManager.noise, params), 0) + 50
  ball.position.y = startHeight
  if (ball.body) {
    ball.body.position.set(0, startHeight, 0)
  }
  scene.add(ball)
  
  // Update the target in chunkManager to be the ball
  chunkManager.target = ball
  
  // Add checkpoints for fun
  addGoals()
  
  // Start rendering
  requestAnimationFrame(tic)
}

/**
 * Add some fun challenge goals
 */
function addGoals() {
  // Create some goal markers at different points
  const goalPositions = [
    { x: 100, z: 100 },
    { x: -150, z: 150 },
    { x: 200, z: -50 },
  ]
  
  goalPositions.forEach((pos, index) => {
    // Get height at this position
    const y = Math.max(getHeight(pos.x, pos.z, chunkManager.noise, params), 0) + 5
    
    // Create visual marker
    const geometry = new THREE.TorusGeometry(5, 0.5, 8, 16)
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xFFFF00, 
      emissive: 0x888800,
      flatShading: true 
    })
    const goalMarker = new THREE.Mesh(geometry, material)
    goalMarker.position.set(pos.x, y, pos.z)
    goalMarker.rotation.x = Math.PI / 2
    scene.add(goalMarker)
    
    // Add trigger
    if (physicsWorld) {
      physicsWorld.createSphereTrigger(
        new THREE.Vector3(pos.x, y, pos.z),
        5,
        (e) => {
          // Check if collision with ball
          if (e.body === ball.body) {
            // Animate goal reached
            goalMarker.material.color.set(0x00FF00)
            goalMarker.material.emissive.set(0x008800)
            
            // Animate scale
            gsap.to(goalMarker.scale, {
              x: 1.5, y: 1.5, z: 1.5,
              duration: 0.5,
              yoyo: true,
              repeat: 1
            })
            
            // Display message
            showMessage(`Goal ${index + 1} reached! 🎉`)
          }
        }
      )
    }
  })
}

/**
 * Show a floating message
 */
function showMessage(text, duration = 3000) {
  const message = document.createElement('div')
  message.className = 'floating-message'
  message.textContent = text
  document.body.appendChild(message)
  
  // Animate in
  gsap.fromTo(message, 
    { opacity: 0, y: -50 },
    { opacity: 1, y: 0, duration: 0.5 }
  )
  
  // Remove after duration
  setTimeout(() => {
    gsap.to(message, {
      opacity: 0, y: -50, duration: 0.5,
      onComplete: () => message.remove()
    })
  }, duration)
}

/**
 * Reset ball position
 */
function resetBall() {
  const startHeight = Math.max(getHeight(0, 0, chunkManager.noise, params), 0) + 50
  ball.reset(new THREE.Vector3(0, startHeight, 0))
  
  // Show message
  showMessage('Ball reset to start position!')
}

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, params.ambientLight)
const directionalLight = new THREE.DirectionalLight(
  0xffffff,
  params.directionalLight
)
directionalLight.position.set(1, 1, 1)
scene.add(ambientLight, directionalLight)

/**
 * Three.js Clock
 */
const clock = new THREE.Clock()

// Set up scene fog and background
scene.fog = new THREE.Fog(params.fog, 200, 800)
scene.background = new THREE.Color(params.fog)

/**
 * Frame loop
 */
function tic() {
  /**
   * Delta time since last frame
   */
  const deltaTime = clock.getDelta()
  /**
   * Total elapsed time
   */
  const time = clock.getElapsedTime()

  // Update physics
  if (physicsWorld) {
    physicsWorld.update(deltaTime)
  }

  // Update ball with player input
  if (ball) {
    ball.update(deltaTime, inputDirection)
    
    // Check if ball fell below a certain threshold
    if (ball.position.y < -50) {
      resetBall()
    }
    
    // Update camera to follow ball
    updateCamera(deltaTime)
  }

  // Update uniforms values
  uniforms.uTime.value = time
  if (ball) {
    uniforms.uCamera.value.copy(ball.position)
  }

  // Update terrain chunks around the ball
  if (chunkManager) {
    chunkManager.updateChunks()
  }

  // Update controls if enabled
  if (controls.enabled) {
    controls.update()
  }

  renderer.render(scene, camera)

  requestAnimationFrame(tic)
}

/**
 * Update camera to follow the ball in third-person view
 */
function updateCamera(deltaTime) {
  if (!ball) return
  
  // Calculate ideal camera position (third person view)
  // Account for the ball's current direction of travel
  
  // Get the ball's velocity direction
  const ballVelocity = new THREE.Vector3(
    ball.body?.velocity.x || 0,
    ball.body?.velocity.y || 0,
    ball.body?.velocity.z || 0
  )
  
  // Only use horizontal movement for camera direction
  ballVelocity.y = 0
  
  if (ballVelocity.lengthSq() > 1) {
    ballVelocity.normalize()
    
    // Calculate offset based on ball's movement direction
    const desiredOffset = new THREE.Vector3()
    desiredOffset.copy(cameraOffset)
    
    // Rotate offset to align with ball's direction
    // We want camera to be behind the ball in its direction of travel
    const lookDirection = ballVelocity.clone().negate()
    if (lookDirection.lengthSq() > 0.1) {
      // Create a matrix to rotate the offset
      const matrix = new THREE.Matrix4()
      matrix.lookAt(
        new THREE.Vector3(0, 0, 0),
        lookDirection,
        new THREE.Vector3(0, 1, 0)
      )
      
      desiredOffset.applyMatrix4(matrix)
    }
    
    // Smooth transition to new camera position
    const idealPosition = new THREE.Vector3()
    idealPosition.copy(ball.position).add(desiredOffset)
    
    // Smoothly move camera to ideal position
    camera.position.lerp(idealPosition, deltaTime * 2)
  } else {
    // If ball isn't moving much, just use static offset
    const idealPosition = new THREE.Vector3()
    idealPosition.copy(ball.position).add(cameraOffset)
    
    camera.position.lerp(idealPosition, deltaTime * 2)
  }
  
  // Update camera target (look at ball with slight offset)
  cameraLookAt.copy(ball.position).add(new THREE.Vector3(0, 2, 0))
  camera.lookAt(cameraLookAt)
  
  // Keep camera above ground
  const cameraHeight = getHeight(
    camera.position.x,
    camera.position.z,
    chunkManager ? chunkManager.noise : null,
    params
  )
  if (camera.position.y < cameraHeight + 5) {
    camera.position.y = cameraHeight + 5
  }
}

window.addEventListener('resize', handleResize)

function handleResize() {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  renderer.setSize(sizes.width, sizes.height)

  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(pixelRatio)
}

// Add some style for mobile controls and messages
const style = document.createElement('style')
style.textContent = `
.touch-controls {
  position: fixed;
  bottom: 30px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1000;
  pointer-events: none;
}

.touch-joystick {
  width: 100px;
  height: 100px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  position: relative;
  margin-left: 30px;
  pointer-events: auto;
}

.touch-stick {
  width: 40px;
  height: 40px;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: transform 0.1s ease-out;
}

.touch-button {
  width: 60px;
  height: 60px;
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  margin-right: 30px;
  pointer-events: auto;
  color: white;
}

.reset-button {
  background-color: rgba(255, 50, 50, 0.5);
}

.floating-message {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 18px;
  font-family: sans-serif;
  z-index: 1000;
  text-align: center;
  pointer-events: none;
}
`
document.head.appendChild(style)