import {
	BufferAttribute,
	MeshStandardMaterial,
	Mesh,
	PlaneGeometry,
	Vector3,
	DoubleSide,
	Color
  } from 'three';
  import { getHeight } from './heightGenerator';
  import Trees from './trees';
  
  // Stylized material with flat shading for low-poly look
  // Use a function to create the material to ensure unique instances
  const createMaterial = () => new MeshStandardMaterial({
    color: 0x8BC34A, // Base grass green color
    flatShading: true, 
    side: DoubleSide,
    roughness: 0.8,
    metalness: 0.1
  });
  
  // Very minimal terrain curvature - reduced for mountain focus
  const CURVATURE = 15000;
  
  export default class Chunk extends Mesh {
	treesPositionArray = [];
	treesCount = 0;
  
	constructor(
	  size,
	  noise,
	  params = {},
	  LOD = 0,
	  position = new Vector3(0, 0, 0),
	  uniforms,
	  assets = {}
	) {
	  // Use lower density for more visible facets
	  const isMobile = window.innerWidth < 768;
	  const density = isMobile ? 8 : 6;
	  const segments = Math.max(Math.floor(size * 0.6 ** LOD), density) / density;
	  const geometry = new PlaneGeometry(size, size, segments, segments);
	  geometry.rotateX(-Math.PI * 0.5);
  
	  // Create a unique material instance for each chunk
	  const material = createMaterial();
  
	  super(geometry, material);
  
	  this.position.copy(position);
	  this.noise = noise;
	  this.size = size;
	  this.LOD = LOD;
	  this.params = params;
	  this.uniforms = uniforms;
	  this.uniforms.uCurvature = { value: CURVATURE };
	  this.assets = assets;
  
	  this.updateGeometry();
	  this.setupShaders();
	}
  
	dispose() {
	  this.parent?.remove(this);
	  this.geometry?.dispose();
	  if (this.material) this.material.dispose();
	  if (this.trees) {
		this.trees.dispose();
	  }
	}
  
	setupShaders() {
	  this.material.onBeforeCompile = (shader) => {
		if (this.uniforms) {
		  shader.uniforms = {
			...shader.uniforms,
			...this.uniforms,
		  };
		}
  
		// Common code for both vertex and fragment shaders
		shader.vertexShader = shader.vertexShader.replace(
		  '#include <common>',
		  `
		  #include <common>
		  uniform float uTime;
		  uniform vec3 uCamera;
		  uniform float uCurvature;
		  varying vec3 wPosition;
		  varying float distanceFromCamera;
		  attribute float height;
		  `
		);
  
		// Vertex shader for low-poly effect
		shader.vertexShader = shader.vertexShader.replace(
		  '#include <project_vertex>',
		  `
		  vec4 mvPosition = vec4( transformed, 1.0 );
  
		  #ifdef USE_BATCHING
			mvPosition = batchingMatrix * mvPosition;
		  #endif
  
		  #ifdef USE_INSTANCING
			mvPosition = instanceMatrix * mvPosition;
		  #endif
  
		  wPosition = (modelMatrix * vec4( transformed, 1.0 )).xyz;
		  
		  // Apply terrain curvature
		  float dist = length(wPosition.xyz - uCamera);
		  distanceFromCamera = dist;
		  mvPosition.y += -uCurvature * (1. - cos(dist / uCurvature));
  
		  mvPosition = modelViewMatrix * mvPosition;
		  gl_Position = projectionMatrix * mvPosition;
		  `
		);
  
		// Fragment shader 
		shader.fragmentShader = shader.fragmentShader.replace(
		  '#include <common>',
		  `
		  #include <common>
		  uniform float uTime;
		  uniform vec3 uCamera;
		  varying vec3 wPosition;
		  varying float distanceFromCamera;
		  `
		);
  
		// Color assignment based on height and position - optimized for mountain terrain
		shader.fragmentShader = shader.fragmentShader.replace(
		  '#include <color_fragment>',
		  `
		  // Height-based coloring
			float height = wPosition.y;
			
			// Path detection
			float pathX = 0.7071;
			float pathZ = 0.7071;
			float pathDist = abs((wPosition.x * pathZ - wPosition.z * pathX)) * 0.02;
			float pathMask = min(1.0, pathDist * 8.0);
			
			// Distance from center for mountain effect
			float distFromCenter = length(wPosition.xz) * 0.002;
			
			// Enhanced colors with stronger green for grass
			vec3 mountainTop = vec3(0.25, 0.45, 0.15);    // Green mountain top (darker)
			vec3 mountainMid = vec3(0.3, 0.5, 0.2);       // Green mid mountain (medium)
			vec3 grassColor = vec3(0.38, 0.58, 0.18);     // Deep grass green
			vec3 lowerGrassColor = vec3(0.43, 0.63, 0.22); // Lighter grass for lower areas
			vec3 pathColor = vec3(0.85, 0.75, 0.55);      // Sandy path
			
			// Choose color based on height and path
			vec3 terrainColor;
			
			if (pathMask < 0.5) {
				// Path color with slight variation
				terrainColor = pathColor;
			} 
			else if (height > 30.0) {
				// Mountain top - now green instead of snow
				terrainColor = mountainTop;
			} 
			else if (height > 15.0) {
				// Mountain sides - blend between top and mid
				float blend = smoothstep(15.0, 30.0, height);
				terrainColor = mix(mountainMid, mountainTop, blend);
			}
			else if (height > 5.0) {
				// Lower mountain to grass transition
				float blend = smoothstep(5.0, 15.0, height);
				terrainColor = mix(grassColor, mountainMid, blend);
			}
			else {
				// Ensure grass areas are definitely green
				float blend = smoothstep(0.0, 5.0, height);
				terrainColor = mix(lowerGrassColor, grassColor, blend);
			}
			
			// Assign the color
			diffuseColor.rgb = terrainColor;
			
			// Add very minimal distance fog - blue sky color
			diffuseColor.rgb = mix(
				vec3(0.6, 0.8, 0.95), // Sky blue fog
				diffuseColor.rgb, 
				smoothstep(900.0, 300.0, distanceFromCamera)
			);
		  `
		);
	  };
	  
	  // Force material to update
	  this.material.needsUpdate = true;
	}
  
	updateLOD(LOD) {
	  if (LOD === this.LOD) return;
  
	  this.LOD = LOD;
	  // Calculate resolution for visual facets
	  const isMobile = window.innerWidth < 768;
	  const density = isMobile ? 8 : 6;
	  const segments = Math.max(Math.floor(this.size * 0.6 ** LOD), density) / density;
	  const geometry = new PlaneGeometry(this.size, this.size, segments, segments);
	  geometry.rotateX(-Math.PI * 0.5);
	  
	  this.geometry.dispose();
	  this.geometry = geometry;
	  this.updateGeometry();
	  
	  // Ensure shader updates are applied when LOD changes
	  this.setupShaders();
	}
  
	createHeightAttribute() {
	  const posAttr = this.geometry.getAttribute('position');
	  const heightAttr = this.geometry.getAttribute('height');
  
	  if (!heightAttr) {
		this.geometry.setAttribute(
		  'height',
		  new BufferAttribute(new Float32Array(posAttr.count), 1)
		);
	  }
  
	  return this.geometry.getAttribute('height');
	}
  
	updateGeometry() {
	  this.treesPositionArray = [];
	  const posAttr = this.geometry.getAttribute('position');
	  const heightAttr = this.createHeightAttribute();
  
	  for (let i = 0; i < posAttr.count; i++) {
		const x = posAttr.getX(i) + this.position.x;
		const z = posAttr.getZ(i) + this.position.z;
  
		let h = getHeight(x, z, this.noise, this.params);
  
		heightAttr.setX(i, h);
		posAttr.setY(i, h);
	  }
  
	  posAttr.needsUpdate = true;
	  this.geometry.computeVertexNormals();
	  
	  // Ensure material updates
	  this.material.needsUpdate = true;
  
	  // Generate trees only for close chunks and not on high mountain
	  if (!this.trees && this.LOD <= 1) {
		this.generateTrees();
	  }
	}
  
	generateTrees() {
	  // Skip if we don't have tree assets
	  if (!this.assets) return;
	  
	  const isMobile = window.innerWidth < 768;
	  const density = isMobile ? 16 : 12;
	  const half = this.size / 2;
	  
	  for (let i = -half; i < half; i += density) {
		for (let j = -half; j < half; j += density) {
		  const x = i + this.position.x;
		  const z = j + this.position.z;
		  let h = getHeight(x, z, this.noise, this.params);
  
		  this.addTree(x, h, z);
		}
	  }
  
	  this.createTreesMesh();
	}
  
	addTree(x, y, z) {
	  if (!this.noise) return;
	  
	  // Path detection - don't add trees on path
	  const pathX = 0.7071; // Path direction
	  const pathZ = 0.7071;
	  const pathDist = Math.abs((x * pathZ - z * pathX)) * 0.02;
	  const pathMask = Math.min(1.0, pathDist * 8.0);
	  
	  // Distance from center - fewer trees near top of mountain
	  const distFromCenter = Math.sqrt(x * x + z * z);
	  
	  // Trees only on lower slopes and grass, not on path, not too high
	  if (pathMask > 0.6 && y > 3 && y < 18 && Math.random() < 0.5 && distFromCenter > 60) {
		this.treesPositionArray.push(x - this.position.x, y, z - this.position.z);
		this.treesCount++;
	  }
	}
  
	createTreesMesh() {
	  if (this.treesPositionArray.length === 0) return;
  
	  const position = new BufferAttribute(
		new Float32Array(this.treesPositionArray), 
		3
	  );
  
	  if (this.trees) {
		this.remove(this.trees);
		this.trees.dispose();
	  }
  
	  this.trees = new Trees(position, this.uniforms);
	  this.add(this.trees);
	}
  }