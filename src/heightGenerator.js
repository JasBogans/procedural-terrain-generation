import { MathUtils } from 'three';

/**
 * Generates stylized terrain height with a central mountain and path/road
 */
export function getHeight(x, z, noises, params) {
  // Safety check for missing noise functions
  if (!noises) return 30;

  // Base height
  let h = 0;
  const fx = params.frequency.x;
  const fz = params.frequency.z;

  // Add multiple octaves of noise for the base shape
  for (let j = 0; j < Math.min(params.octaves, 3); j++) {
    const octave = j;
    const amplitude = params.amplitude * params.persistance ** octave;
    const lacunarity = params.lacunarity ** octave;

    // Get noise value at this location and octave
    let increment = noises[j](
      x * 0.01 * fx * lacunarity,
      z * 0.01 * fz * lacunarity
    );

    // Square the value for more pronounced features
    increment *= increment;
    h += increment * amplitude;
  }

  // Calculate distance from center - used for the mountain shape
  const distFromCenter = Math.sqrt(x * x + z * z) * 0.002;
  
  // Create a steeper central mountain with defined slope
  // Stronger mountain influence for pronounced central peak
  const mountainMassif = Math.max(0, 1 - distFromCenter * 0.9);
  const mountainHeight = 60; // Higher peak
  
  // Apply heightmap mountain base with height that drops as we go further from center
  h = (h * 0.3) + (mountainHeight * mountainMassif * mountainMassif);
  
  // Create a coherent path from the edge to the mountain peak
  // Path direction vector (normalized)
  const pathX = 0.7071; // 45 degrees path
  const pathZ = 0.7071;
  
  // Distance from path centerline (using dot product)
  const pathDist = Math.abs((x * pathZ - z * pathX)) * 0.02;
  
  // Path mask - closer to path center = lower value
  const pathMask = Math.min(1, pathDist * 8);
  
  // Create a sloped path down the mountain
  if (pathMask < 0.5) {
    // Reduce height along path, but maintain downward slope
    // The 0.8 factor keeps some height for the slope rather than flattening completely
    h *= 0.8 + (0.2 * pathMask);
    
    // Add some small bumps for visual interest along path edges
    const edgeBumps = noises[0](x * 0.1, z * 0.1) * 0.8 * pathMask;
    h += edgeBumps;
  }

  // Low-poly faceted effect - similar to the reference image
  const facetSize = 12; // Controls the size of the facets
  const facetX = Math.floor(x / facetSize) * facetSize;
  const facetZ = Math.floor(z / facetSize) * facetSize;
  
  // Use noise at facet center for local height variation
  const facetNoise = noises[1](facetX * 0.01, facetZ * 0.01);
  h += facetNoise * 1.5;
  
  // Ensure minimum height and the ground is never below zero
  return Math.max(h, 0);
}