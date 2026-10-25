import { useDeferredValue, useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
} from 'three';
import { STRATA_BANDS, STRATA_SPAN_M, buildBlock } from '../lib/block';
import { useSceneStore } from '../state/store';

/** How far the block extends below the lowest ground, in world units. */
const BLOCK_DEPTH = 2200;

function makeStrataTexture(): CanvasTexture {
  const width = 8;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the ground texture.');
  let y = 0;
  for (const [thickness, color] of STRATA_BANDS) {
    const h = (thickness / STRATA_SPAN_M) * height;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, width, h + 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'; // a thin dark seam between layers
    ctx.fillRect(0, y, width, 1);
    y += h;
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/** The solid ground under the terrain: layered soil and stone on every side, so the model is a block, not a sheet. */
export function Block() {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    if (!assets) return g;
    const block = buildBlock(assets.terrain, assets.frame, exaggeration, BLOCK_DEPTH);
    g.setAttribute('position', new BufferAttribute(block.positions, 3));
    g.setAttribute('uv', new BufferAttribute(block.uvs, 2));
    g.setIndex(new BufferAttribute(block.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [assets, exaggeration]);
  const texture = useMemo(() => makeStrataTexture(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}
