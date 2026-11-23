import { KEEP_MARGIN, WORLD_H } from "./balance";
import type { Team } from "./types";

/**
 * Oblique RTS frame for one side.
 * South (`you`) looks north from behind their keep. North (`foe`) looks south
 * from behind theirs. Framed close and clear over the keep + eco house pads so
 * players can deploy houses immediately at match start.
 */
export function homeCameraFrame(team: Team) {
  const north = team === "foe";
  // Keep world-Z (sim Y centered on 0). Eco house pads sit ~54-70 units behind
  // the keep, so aim just behind the keep at a steeper angle for crisp pad clicks.
  const keepZ = WORLD_H / 2 - KEEP_MARGIN;
  const lookDepth = keepZ + 18;
  return {
    yaw: north ? Math.PI - 0.08 : 0.08,
    pitch: 0.68,
    dist: 460,
    lookX: 0,
    lookY: 14,
    lookZ: north ? -lookDepth : lookDepth,
  };
}

/**
 * Oblique frame of the whole valley for a commentator.
 * Look sits near midfield so both keeps start in view. Pan and zoom still use the free camera.
 */
export function fieldCameraFrame() {
  return {
    yaw: 0,
    pitch: 0.72,
    dist: 1320,
    lookX: 0,
    lookY: 20,
    lookZ: 70,
  };
}

/** Camera sits on the home side of the keep: +Z is south, −Z is north. */
export function homeCameraZ(team: Team) {
  const frame = homeCameraFrame(team);
  return frame.lookZ + frame.dist * Math.sin(frame.pitch) * Math.cos(frame.yaw);
}
