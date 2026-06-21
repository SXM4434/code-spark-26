// No-overdraw solver: nudge an incoming cluster off of locked shapes.
// Spiral search for a free slot in the current viewport; extend right if none.
import type { CanvasNode } from "./types";

type Box = { x: number; y: number; w: number; h: number };

const DEFAULT_W = 220;
const DEFAULT_H = 140;

function bounds(node: CanvasNode): Box {
  const w = (node.width as number | undefined) ?? DEFAULT_W;
  const h = (node.height as number | undefined) ?? DEFAULT_H;
  return { x: node.position.x, y: node.position.y, w, h };
}

function overlap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const dy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = dx * dy;
  const ref = Math.min(a.w * a.h, b.w * b.h);
  return ref === 0 ? 0 : area / ref;
}

export function solveCluster(
  incoming: CanvasNode[],
  existing: CanvasNode[],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): CanvasNode[] {
  const blockers = existing
    .filter((n) => {
      const lm = (n.data?.meta?.lockMode as string | undefined) ?? "open";
      return lm !== "open";
    })
    .map(bounds);

  if (blockers.length === 0 || incoming.length === 0) return incoming;

  // Compute cluster bounds (relative to origin)
  const minX = Math.min(...incoming.map((n) => n.position.x));
  const minY = Math.min(...incoming.map((n) => n.position.y));
  const maxX = Math.max(...incoming.map((n) => n.position.x + ((n.width as number | undefined) ?? DEFAULT_W)));
  const maxY = Math.max(...incoming.map((n) => n.position.y + ((n.height as number | undefined) ?? DEFAULT_H)));
  const clusterBox: Box = { x: origin.x, y: origin.y, w: maxX - minX, h: maxY - minY };

  function fits(off: { x: number; y: number }): boolean {
    const moved: Box = { x: clusterBox.x + off.x, y: clusterBox.y + off.y, w: clusterBox.w, h: clusterBox.h };
    return !blockers.some((b) => overlap(moved, b) > 0.3);
  }

  if (fits({ x: 0, y: 0 })) return incoming;

  // Spiral search
  const step = 60;
  for (let r = 1; r <= 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (fits({ x: dx * step, y: dy * step })) {
          const ox = dx * step;
          const oy = dy * step;
          return incoming.map((n) => ({ ...n, position: { x: n.position.x + ox, y: n.position.y + oy } }));
        }
      }
    }
  }

  // Fallback: extend right of the rightmost blocker.
  const rightMost = Math.max(...blockers.map((b) => b.x + b.w));
  const ox = rightMost + 80 - minX;
  return incoming.map((n) => ({ ...n, position: { x: n.position.x + ox, y: n.position.y } }));
}
