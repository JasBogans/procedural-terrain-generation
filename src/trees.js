import {
	Color,
	ConeGeometry,
	CylinderGeometry,
	Group,
	InstancedMesh,
	MathUtils,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Quaternion,
	Vector3,
  } from 'three';
  
  // Stylized low-poly tree materials - bright green like in reference
  const foliageMaterial = new MeshStandardMaterial({
	color: 0x2D8C21, // Stylized dark green for foliage
	flatShading: true,
	roughness: 0.9,
  });
  
  const trunkMaterial = new MeshStandardMaterial({
	color: 0x6F4E37, // Brown trunk
	flatShading: true,
	roughness: 0.9,
  });
  
  export default class Trees extends Group {
	constructor(position, uniforms) {
	  super();
	  this.bufferPosition = position;
	  this.uniforms = uniforms;
  
	  // Create tree instances
	  this.createTrees();
	}
  
	dispose() {
	  this.children.forEach(child => {
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	  });
	  this.clear();
	}
  
	createTrees() {
	  if (this.bufferPosition.count === 0) return;
	  
	  // Create conical trees like in the reference image
	  // Each tree has 2-3 cones stacked + trunk
  
	  // Trunk layer
	  const trunkGeometry = new CylinderGeometry(0.5, 0.8, 2, 5);
	  const trunk = new InstancedMesh(
		trunkGeometry,
		trunkMaterial,
		this.bufferPosition.count
	  );
	  
	  // First (bottom) cone layer
	  const cone1Geometry = new ConeGeometry(3, 4, 6);
	  const cone1 = new InstancedMesh(
		cone1Geometry,
		foliageMaterial, 
		this.bufferPosition.count
	  );
	  
	  // Second (middle) cone layer
	  const cone2Geometry = new ConeGeometry(2.5, 3.5, 6);
	  const cone2 = new InstancedMesh(
		cone2Geometry,
		foliageMaterial, 
		this.bufferPosition.count
	  );
	  
	  // Third (top) cone layer
	  const cone3Geometry = new ConeGeometry(1.8, 3, 6);
	  const cone3 = new InstancedMesh(
		cone3Geometry,
		foliageMaterial, 
		this.bufferPosition.count
	  );
	  
	  // Set up matrices and colors for each tree
	  const matrix = new Matrix4();
	  const position = new Vector3();
	  const quaternion = new Quaternion();
	  const scale = new Vector3();
	  
	  for (let i = 0; i < this.bufferPosition.count; i++) {
		const x = this.bufferPosition.getX(i);
		const y = this.bufferPosition.getY(i);
		const z = this.bufferPosition.getZ(i);
		
		// Random scale variation
		const treeScale = MathUtils.randFloat(0.8, 1.3);
		
		// Random rotation for variety
		const rotation = MathUtils.randFloat(0, Math.PI * 2);
		quaternion.setFromAxisAngle(new Vector3(0, 1, 0), rotation);
		
		// Position and scale the trunk
		position.set(x, y, z);
		scale.set(treeScale * 0.8, treeScale, treeScale * 0.8);
		matrix.compose(position, quaternion, scale);
		trunk.setMatrixAt(i, matrix);
		
		// Position and scale the cone layers
		// Bottom cone
		position.set(x, y + treeScale * 2, z);
		scale.set(treeScale, treeScale, treeScale);
		matrix.compose(position, quaternion, scale);
		cone1.setMatrixAt(i, matrix);
		
		// Middle cone
		position.set(x, y + treeScale * 4, z);
		scale.set(treeScale * 0.9, treeScale * 0.9, treeScale * 0.9);
		matrix.compose(position, quaternion, scale);
		cone2.setMatrixAt(i, matrix);
		
		// Top cone
		position.set(x, y + treeScale * 6, z);
		scale.set(treeScale * 0.7, treeScale * 0.8, treeScale * 0.7);
		matrix.compose(position, quaternion, scale);
		cone3.setMatrixAt(i, matrix);
		
		// Apply slight color variation to make trees more natural
		const trunkColor = new Color(0x6F4E37).multiplyScalar(
		  MathUtils.randFloat(0.9, 1.1)
		);
		trunk.setColorAt(i, trunkColor);
		
		const foliageColor = new Color(0x2D8C21).multiplyScalar(
		  MathUtils.randFloat(0.9, 1.1)
		);
		cone1.setColorAt(i, foliageColor);
		cone2.setColorAt(i, foliageColor);
		cone3.setColorAt(i, foliageColor);
	  }
	  
	  // Add all parts to the tree group
	  this.add(trunk);
	  this.add(cone1);
	  this.add(cone2);
	  this.add(cone3);
	  
	  // Apply shader modifications for visual consistency
	  [foliageMaterial, trunkMaterial].forEach(material => {
		material.onBeforeCompile = (shader) => {
		  if (this.uniforms) {
			shader.uniforms = {
			  ...shader.uniforms,
			  ...this.uniforms,
			};
		  }
		  
		  // Add shared code
		  shader.vertexShader = shader.vertexShader.replace(
			'#include <common>',
			`
			#include <common>
			uniform float uTime;
			uniform vec3 uCamera;
			uniform float uCurvature; 
			varying vec3 wPosition;
			varying float distanceFromCamera;
			`
		  );
		  
		  // Add vertex transformations
		  shader.vertexShader = shader.vertexShader.replace(
			'#include <project_vertex>',
			`
			vec4 mvPosition = vec4( transformed, 1.0 );
			
			#ifdef USE_INSTANCING
			  mvPosition = instanceMatrix * mvPosition;
			  wPosition = (modelMatrix * instanceMatrix * vec4( transformed, 1.0 )).xyz;
			#else
			  wPosition = (modelMatrix * vec4( transformed, 1.0 )).xyz;
			#endif
			
			// Apply terrain curvature
			float dist = length(wPosition.xyz - uCamera);
			distanceFromCamera = dist;
			mvPosition.y += -uCurvature * (1.0 - cos(dist / uCurvature));
			
			mvPosition = modelViewMatrix * mvPosition;
			gl_Position = projectionMatrix * mvPosition;
			`
		  );
		  
		  // Add fragment code
		  shader.fragmentShader = shader.fragmentShader.replace(
			'#include <common>',
			`
			#include <common>
			uniform float uTime;
			varying vec3 wPosition;
			varying float distanceFromCamera;
			`
		  );
		  
		  // Add distance fog
		  shader.fragmentShader = shader.fragmentShader.replace(
			'#include <color_fragment>',
			`
			#include <color_fragment>
			
			// Add distance fog
			diffuseColor.rgb = mix(
			  vec3(0.6, 0.8, 0.95), // Sky blue fog
			  diffuseColor.rgb, 
			  smoothstep(900.0, 300.0, distanceFromCamera)
			);
			`
		  );
		};
	  });
	}
  }