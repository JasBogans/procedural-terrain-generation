import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { FlyControls } from 'three/examples/jsm/controls/FlyControls'
import * as dat from 'lil-gui'
import Chunk from './src/chunk'
import ChunkManager from './src/chunkManager'

/**
 * Debug
 */
const gui = new dat.GUI()

const params = {
	amplitude: 23,
	frequency: {
		x: 0.5,
		z: 0.5,
	},
	xOffset: 0,
	zOffset: 0,
	octaves: 3,
	lacunarity: 2,
	persistance: 0.5,
	LOD: 0,
	fog: 0x191362,
}

const uniforms = {
	uTime: { value: 0 },
	uRocksColor: { value: new THREE.Color('brown') },
	uCamera: { value: new THREE.Vector3() },
}

gui.addColor(params, 'fog').onChange((val) => {
	scene.background.set(val)
	scene.fog.color.set(val)
})

gui
	.add(params, 'amplitude', 0, 100, 0.1)
	.onChange(() => chunkManager.onParamsChange())
// gui.add(params, 'LOD', 0, 4, 1).onChange((val) => chunk.updateLOD(val))
gui
	.add(params, 'octaves', 1, 10, 1)
	.onChange(() => chunkManager.onParamsChange())
gui
	.add(params, 'persistance', 0, 1, 0.05)
	.onChange(() => chunkManager.onParamsChange())

gui
	.add(params, 'lacunarity', 1, 5, 0.5)
	.onChange(() => chunkManager.onParamsChange())

gui
	.add(params.frequency, 'x', 0.01, 2, 0.01)
	.onChange(() => chunkManager.onParamsChange())
	.onChange(() => chunkManager.onParamsChange())
gui
	.add(params.frequency, 'z', 0.01, 2, 0.01)
	.onChange(() => chunkManager.onParamsChange())
gui
	.add(params, 'xOffset', -10, 10, 0.1)
	.onChange(() => chunkManager.onParamsChange())
	.onChange(() => chunkManager.onParamsChange())
gui
	.add(params, 'zOffset', -10, 10, 0.1)
	.onChange(() => chunkManager.onParamsChange())

/**
 * Scene
 */
const scene = new THREE.Scene()

/**
 * BOX
 */
// const material = new THREE.MeshNormalMaterial()
// const geometry = new THREE.BoxGeometry(1, 1, 1)

// const mesh = new THREE.Mesh(geometry, material)
// scene.add(mesh)

/**
 * render sizes
 */
const sizes = {
	width: window.innerWidth,
	height: window.innerHeight,
}
/**
 * Camera
 */
const fov = 60
const camera = new THREE.PerspectiveCamera(
	fov,
	sizes.width / sizes.height,
	0.1,
	10000
)
camera.position.set(100, 40, 100)
camera.lookAt(new THREE.Vector3(0, 30, 0))

/**
 * Show the axes of coordinates system
 */
const axesHelper = new THREE.AxesHelper(3)
// scene.add(axesHelper)

/**
 * renderer
 */
const renderer = new THREE.WebGLRenderer({
	antialias: window.devicePixelRatio < 2,
	logarithmicDepthBuffer: true,
})
document.body.appendChild(renderer.domElement)
handleResize()

/**
 * OrbitControls
 */
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.screenSpacePanning = false
// const controls = new FlyControls(camera, renderer.domElement)
// controls.movementSpeed = 50
// controls.rollSpeed = 0.75

/**
 * Terrain chunk
 */
const chunkSize = 256

const chunkManager = new ChunkManager(
	chunkSize,
	camera,
	params,
	scene,
	uniforms
)

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5)
const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5)
directionalLight.position.set(1, 1, 1)
scene.add(ambientLight, directionalLight)

/**
 * Three js Clock
 */
const clock = new THREE.Clock()

scene.fog = new THREE.Fog(params.fog, 250, 900)
scene.background = new THREE.Color(params.fog)

/**
 * frame loop
 */
function tic() {
	/**
	 * tempo trascorso dal frame precedente
	 */
	const deltaTime = clock.getDelta()
	/**
	 * tempo totale trascorso dall'inizio
	 */
	const time = clock.getElapsedTime()

	// update uniforms values
	uniforms.uTime.value = time
	uniforms.uCamera.value.copy(camera.position)

	chunkManager.updateChunks()

	controls.update(deltaTime)

	renderer.render(scene, camera)

	requestAnimationFrame(tic)
}

requestAnimationFrame(tic)

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
