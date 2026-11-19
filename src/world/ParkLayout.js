import * as THREE from 'three';

export const PARK_CONSTANTS = {
  RIVER_BASE_R: 65.0,
  RIVER_HALF_WIDTH: 4.8,
  BRIDGE_PEAK_Y: 2.85,
  OUTER_PARK_R: 138.0,
  TRAIN_BASE_R: 114.0,
  PLAZA_R: 16.0,
  PARADE_INNER_R: 16.0,
  PARADE_OUTER_R: 24.0,
};

/**
 * Asymmetric meandering river centerline radius as a 2π-periodic smooth harmonic curve.
 * Angle uses Park convention: angle = Math.atan2(x, z) (0 = +Z South, π/2 = +X East).
 */
export function getRiverCenterRadius(angle) {
  return (
    PARK_CONSTANTS.RIVER_BASE_R +
    5.5 * Math.sin(2.0 * angle + 0.4) +
    3.8 * Math.cos(3.0 * angle - 0.7)
  );
}

/**
 * Asymmetric Grand Circle Royal Steam Train track radius.
 */
export function getTrainTrackRadius(angle) {
  return (
    PARK_CONSTANTS.TRAIN_BASE_R +
    3.5 * Math.sin(2.0 * angle + 0.5) +
    2.0 * Math.cos(angle - 0.4)
  );
}

/**
 * 5 asymmetrically positioned bridges crossing the meandering river.
 */
export const BRIDGE_SPECS = [
  { id: 'south', name: 'Main Royal Gate Bridge', angle: 0.05, halfWidth: 3.4, halfSpan: 9.0, style: 'royal' },
  { id: 'se', name: 'Patisserie Bay Bridge', angle: 1.08, halfWidth: 3.1, halfSpan: 9.0, style: 'patisserie' },
  { id: 'ne', name: 'Thrill Peak Bridge', angle: 2.15, halfWidth: 3.1, halfSpan: 9.0, style: 'thrill' },
  { id: 'north', name: 'Castle Meadow Bridge', angle: 3.18, halfWidth: 3.1, halfSpan: 9.0, style: 'royal' },
  { id: 'west', name: 'Harvest Forest Bridge', angle: 4.65, halfWidth: 3.2, halfSpan: 9.0, style: 'forest' },
].map((spec) => {
  const rMid = getRiverCenterRadius(spec.angle);
  const ux = Math.sin(spec.angle);
  const uz = Math.cos(spec.angle);
  return {
    ...spec,
    rMid,
    cx: ux * rMid,
    cz: uz * rMid,
    ux,
    uz,
    tx: uz,
    tz: -ux,
  };
});

export const CASTLE_PLATEAU = {
  x: -6.0,
  z: -40.0,
  radius: 13.2,
  height: 1.8,
  stairMinX: -10.0,
  stairMaxX: -2.0,
  stairBottomZ: -20.5,
  stairTopZ: -27.6,
};

export const ZONE_CENTERS = {
  // Zone 1: Royal Aubergine Citadel & Hub
  fountain: new THREE.Vector3(0, 0, 0),
  castle: new THREE.Vector3(-6, CASTLE_PLATEAU.height, -41.5),
  castleForecourt: new THREE.Vector3(-6, 0, -19),
  mainGate: new THREE.Vector3(4.3, 0, 85.4),
  train: new THREE.Vector3(24.0, 0, 111.0),
  boatDock: new THREE.Vector3(-13.0, 0, 58.6),

  // Zone 2: Amuseables Patisserie Bay (SE)
  carousel: new THREE.Vector3(31, 0, 18),
  teacups: new THREE.Vector3(17, 0, 38),
  pastry: new THREE.Vector3(73, 0, 38),
  hoops: new THREE.Vector3(62, 0, 54),
  splash: new THREE.Vector3(56, 0, 78),

  // Zone 3: Aubergine Thrill Peak (NE & N)
  coaster: new THREE.Vector3(33, 0, -23),
  spacecoaster: new THREE.Vector3(22, 0, -88),
  droptower: new THREE.Vector3(54, 0, -64),
  galleon: new THREE.Vector3(74, 0, -36),

  // Zone 4: Bunny's Harvest Forest & Mystic Manor (W / NW / SW)
  ferris: new THREE.Vector3(-34, 0, -16),
  haunted: new THREE.Vector3(-36, 0, -82),
  windmill: new THREE.Vector3(-80, 0, -24),
  claw: new THREE.Vector3(-83, 0, 12),
  whack: new THREE.Vector3(-76, 0, 32),
  ringtoss: new THREE.Vector3(-26, 0, 78),
  buzz: new THREE.Vector3(-54, 0, 74),

  // Zone 5: Cool Neon Carnival Pier (E)
  bumper: new THREE.Vector3(82, 0, -6),
  darts: new THREE.Vector3(77, 0, 18),
};

const bSouth = BRIDGE_SPECS[0];
const bSE = BRIDGE_SPECS[1];
const bNE = BRIDGE_SPECS[2];
const bNorth = BRIDGE_SPECS[3];
const bWest = BRIDGE_SPECS[4];

function bridgeApproach(b, offset) {
  return [b.cx + b.ux * offset, b.cz + b.uz * offset];
}

/**
 * Curved organic pathways connecting the 5 asymmetric zones.
 * Both ParkEnvironment visuals and ParkLayout ground/exclusion logic share these exact curves.
 */
export const CURVED_PATH_ROUTES = [
  {
    id: 'hub_south',
    halfWidth: 3.6,
    points: [[0, 16], [1.8, 36], bridgeApproach(bSouth, -8.5), bridgeApproach(bSouth, 8.5), [4.3, 85.4]],
  },
  {
    id: 'hub_train_branch',
    halfWidth: 3.0,
    points: [[4.3, 85.4], [12.5, 95.0], [18.5, 103.5], [24.0, 111.0]],
  },
  {
    id: 'hub_castle_stairs',
    halfWidth: 4.0,
    points: [[0, -15], [-3.2, -18.5], [-6.0, -22.5], [-6.0, -28.0]],
  },
  {
    id: 'se_patisserie_inner',
    halfWidth: 3.0,
    points: [[10, 14], [17, 38], [26, 30], [31, 18], [16, 10]],
  },
  {
    id: 'se_bridge_link',
    halfWidth: 3.0,
    points: [[31, 18], [43, 23], bridgeApproach(bSE, -8.5), bridgeApproach(bSE, 8.5), [73, 38]],
  },
  {
    id: 'ne_thrill_link',
    halfWidth: 3.0,
    points: [[11, -11], [19.5, -15.5], [25, -38], bridgeApproach(bNE, -8.5), bridgeApproach(bNE, 8.5), [74, -36]],
  },
  {
    id: 'ne_droptower_spur',
    halfWidth: 2.8,
    points: [[74, -36], [67, -50], [54, -64]],
  },
  {
    id: 'north_castle_loop',
    halfWidth: 2.8,
    points: [[12, -26], [16, -42], [10, -52], bridgeApproach(bNorth, -8.5), bridgeApproach(bNorth, 8.5), [8, -73], [24, -66], [42, -66], [54, -64]],
  },
  {
    id: 'west_forest_link',
    halfWidth: 3.1,
    points: [[-14, -5], [-26, -11], [-34, -16], [-48, -10], bridgeApproach(bWest, -8.5), bridgeApproach(bWest, 8.5), [-78, -6]],
  },
  {
    id: 'west_arcade_loop',
    halfWidth: 3.0,
    points: [[-80, -24], [-80, -14], [-78, -6], [-83, 12], [-80, 24], [-76, 32]],
  },
  {
    id: 'sw_boat_promenade',
    halfWidth: 2.8,
    points: [[-10, 14], [-22, 24], [-26, 34], [-18, 46], [-13, 58.6]],
  },
  {
    id: 'east_pier_boardwalk',
    halfWidth: 3.4,
    points: [[73, 38], [76, 26], [77, 18], [80, 5], [82, -6], [79, -22], [74, -36]],
  },
  {
    id: 'nw_haunted_spur',
    halfWidth: 2.8,
    points: [bridgeApproach(bNorth, 8.5), [-14, -75], [-25, -73]],
  },
  {
    id: 'sw_carnival_promenade',
    halfWidth: 3.0,
    points: [[4.3, 85.4], [-12, 82], [-26, 78], [-42, 70]],
  },
  {
    id: 'se_splash_promenade',
    halfWidth: 3.0,
    points: [[73, 38], [62, 54], [47, 71], [24, 98]],
  },
];

// Pre-sample all curved pathways into tight 2D segment chains for fast distance checks & ground queries
const SAMPLED_PATH_SEGMENTS = CURVED_PATH_ROUTES.map((route) => {
  const curve = new THREE.CatmullRomCurve3(
    route.points.map(([x, z]) => new THREE.Vector3(x, 0, z))
  );
  const steps = Math.max(16, route.points.length * 10);
  const pts = curve.getPoints(steps).map((v) => ({ x: v.x, z: v.z }));
  return { id: route.id, halfWidth: route.halfWidth, pts };
});

function distToPolyline(px, pz, pts) {
  let minSq = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    let t = lenSq > 0.0001 ? ((px - a.x) * abx + (pz - a.z) * abz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = px - (a.x + abx * t);
    const dz = pz - (a.z + abz * t);
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) minSq = dSq;
  }
  return Math.sqrt(minSq);
}

export class ParkLayoutRegistry {
  constructor() {
    this.colliders = [];
    this.exclusions = [];

    // Core Plaza & Gate Exclusions
    this.addExclusion('circle', 0, 0, 25.0);
    this.addExclusion('circle', -6, -19, 10.5);
    this.addExclusion('circle', CASTLE_PLATEAU.x, CASTLE_PLATEAU.z, CASTLE_PLATEAU.radius + 2.4);
    this.addExclusion('box', -6, -24, 5.5, 5.5); // Grand Castle Staircase
    this.addExclusion('circle', ZONE_CENTERS.mainGate.x, ZONE_CENTERS.mainGate.z, 13.5);

    // Core Solid Colliders
    this.addCollider('circle', 0, 0, 4.3); // Fountain pool
    this.addCollider('box', -6, -42.5, 9.6, 5.6); // Castle keep sitting on top of plateau
    // Gatehouse twin pillars aligned to (4.3, 85.4) along South Bridge angle (0.05)
    this.addCollider('box', 4.3 - 6.8, 85.4, 3.0, 2.2);
    this.addCollider('box', 4.3 + 6.8, 85.4, 3.0, 2.2);

    // Attraction Footprints (exclusions for props/trees)
    this.addExclusion('circle', ZONE_CENTERS.coaster.x, ZONE_CENTERS.coaster.z, 17.5);
    this.addExclusion('circle', ZONE_CENTERS.spacecoaster.x, ZONE_CENTERS.spacecoaster.z, 19.2);
    this.addExclusion('circle', ZONE_CENTERS.haunted.x, ZONE_CENTERS.haunted.z, 16.5);
    this.addExclusion('circle', ZONE_CENTERS.buzz.x, ZONE_CENTERS.buzz.z, 16.5);
    this.addExclusion('circle', ZONE_CENTERS.splash.x, ZONE_CENTERS.splash.z, 16.0);
    this.addExclusion('circle', ZONE_CENTERS.hoops.x, ZONE_CENTERS.hoops.z, 8.5);
    this.addExclusion('circle', ZONE_CENTERS.ringtoss.x, ZONE_CENTERS.ringtoss.z, 8.5);
    this.addExclusion('circle', ZONE_CENTERS.ferris.x, ZONE_CENTERS.ferris.z, 13.5);
    this.addExclusion('circle', ZONE_CENTERS.teacups.x, ZONE_CENTERS.teacups.z, 11.2);
    this.addExclusion('circle', ZONE_CENTERS.carousel.x, ZONE_CENTERS.carousel.z, 11.2);
    this.addExclusion('circle', ZONE_CENTERS.droptower.x, ZONE_CENTERS.droptower.z, 10.0);
    this.addExclusion('circle', ZONE_CENTERS.galleon.x, ZONE_CENTERS.galleon.z, 11.5);
    this.addExclusion('circle', ZONE_CENTERS.pastry.x, ZONE_CENTERS.pastry.z, 9.5);
    this.addExclusion('circle', ZONE_CENTERS.windmill.x, ZONE_CENTERS.windmill.z, 10.5);
    this.addExclusion('circle', ZONE_CENTERS.whack.x, ZONE_CENTERS.whack.z, 9.2);
    this.addExclusion('circle', ZONE_CENTERS.claw.x, ZONE_CENTERS.claw.z, 9.2);
    this.addExclusion('circle', ZONE_CENTERS.bumper.x, ZONE_CENTERS.bumper.z, 13.5);
    this.addExclusion('circle', ZONE_CENTERS.darts.x, ZONE_CENTERS.darts.z, 8.8);
    this.addExclusion('circle', ZONE_CENTERS.train.x, ZONE_CENTERS.train.z, 10.0);
    this.addExclusion('box', ZONE_CENTERS.boatDock.x, ZONE_CENTERS.boatDock.z, 4.5, 4.5);

    // Main Street & Village building footprints (keep random foliage out of shops)
    this.addExclusion('box', -7.2, 41.0, 4.2, 16.5);
    this.addExclusion('box', 9.2, 51.0, 4.2, 7.5);
    this.addExclusion('box', 86.0, 40.0, 7.0, 14.0); // SE Patisserie Village row
    this.addExclusion('box', -92.0, 5.0, 6.5, 24.0); // West Forest Cottages
    this.addExclusion('circle', 93.0, -18.0, 6.5); // East Harbor Lighthouse

    // Landmark forest & pier plaza exclusions
    this.addExclusion('circle', -30, 22, 9.0); // SW Harvest Overlook & Picnic Meadow
    this.addExclusion('circle', 76, 39, 10.5); // SE Patisserie Cafe Plaza
    this.addExclusion('circle', 80, 2, 11.0); // East Pier Boardwalk center
  }

  addCollider(type, x, z, rOrHalfW, halfD = 0) {
    this.colliders.push({ type, x, z, r: rOrHalfW, hw: rOrHalfW, hd: halfD });
  }

  addExclusion(type, x, z, rOrHalfW, halfD = 0) {
    this.exclusions.push({ type, x, z, r: rOrHalfW, hw: rOrHalfW, hd: halfD });
  }

  isInRiver(x, z, extraBank = 0) {
    const r = Math.hypot(x, z);
    const angle = Math.atan2(x, z);
    const rMid = getRiverCenterRadius(angle);
    return Math.abs(r - rMid) <= PARK_CONSTANTS.RIVER_HALF_WIDTH + extraBank;
  }

  isOnTrainTrack(x, z, extraHalf = 2.6) {
    const r = Math.hypot(x, z);
    const angle = Math.atan2(x, z);
    return Math.abs(r - getTrainTrackRadius(angle)) <= extraHalf;
  }

  isOnWalkwayOrCanal(x, z, margin = 1.2) {
    if (this.isInRiver(x, z, 2.2 + margin)) return true;
    if (this.isOnTrainTrack(x, z, 2.5 + margin)) return true;

    for (const seg of SAMPLED_PATH_SEGMENTS) {
      if (distToPolyline(x, z, seg.pts) <= seg.halfWidth + margin) return true;
    }

    // Castle stairs corridor
    if (
      x >= CASTLE_PLATEAU.stairMinX - margin &&
      x <= CASTLE_PLATEAU.stairMaxX + margin &&
      z >= CASTLE_PLATEAU.stairTopZ - 1.5 - margin &&
      z <= CASTLE_PLATEAU.stairBottomZ + 1.5 + margin
    ) {
      return true;
    }

    return false;
  }

  isPositionClear(x, z, propRadius = 1.0) {
    const r = Math.hypot(x, z);
    if (r > PARK_CONSTANTS.OUTER_PARK_R - 4) return false;
    if (this.isOnWalkwayOrCanal(x, z, propRadius)) return false;

    for (const ex of this.exclusions) {
      if (ex.type === 'circle') {
        if (Math.hypot(x - ex.x, z - ex.z) < ex.r + propRadius) return false;
      } else {
        if (Math.abs(x - ex.x) < ex.hw + propRadius && Math.abs(z - ex.z) < ex.hd + propRadius) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Computes smooth arched bridge deck Y across any of the 5 angled meandering river bridges.
   * Returns null if (x, z) is not on any bridge deck.
   */
  getBridgeSurfaceY(x, z) {
    for (const b of BRIDGE_SPECS) {
      const dx = x - b.cx;
      const dz = z - b.cz;
      const along = dx * b.ux + dz * b.uz;
      const perp = dx * b.tx + dz * b.tz;
      if (Math.abs(along) <= b.halfSpan && Math.abs(perp) <= b.halfWidth) {
        const t = (along + b.halfSpan) / (2 * b.halfSpan);
        return 0.08 + Math.sin(t * Math.PI) * PARK_CONSTANTS.BRIDGE_PEAK_Y;
      }
    }
    return null;
  }

  getGroundHeight(x, z) {
    const bridgeY = this.getBridgeSurfaceY(x, z);
    if (bridgeY !== null) return bridgeY;

    // Grand Royal Staircase ascending up to Castle Plateau
    if (
      x >= CASTLE_PLATEAU.stairMinX - 0.25 &&
      x <= CASTLE_PLATEAU.stairMaxX + 0.25 &&
      z <= CASTLE_PLATEAU.stairBottomZ &&
      z >= CASTLE_PLATEAU.stairTopZ
    ) {
      const t = (CASTLE_PLATEAU.stairBottomZ - z) / (CASTLE_PLATEAU.stairBottomZ - CASTLE_PLATEAU.stairTopZ);
      return 0.08 + THREE.MathUtils.clamp(t, 0, 1) * CASTLE_PLATEAU.height;
    }

    // Elevated +1.8m Royal Castle Terrace Plateau
    const dPlateau = Math.hypot(x - CASTLE_PLATEAU.x, z - CASTLE_PLATEAU.z);
    if (dPlateau <= CASTLE_PLATEAU.radius) {
      return 0.08 + CASTLE_PLATEAU.height;
    }

    // Water channel
    if (this.isInRiver(x, z, -0.05)) {
      return -0.32;
    }

    // Raised cobblestone plazas & curved walkways
    const r = Math.hypot(x, z);
    if (r <= PARK_CONSTANTS.PARADE_OUTER_R + 0.5) return 0.08;
    if (Math.hypot(x - ZONE_CENTERS.mainGate.x, z - ZONE_CENTERS.mainGate.z) <= 13.5) return 0.08;
    if (Math.hypot(x - 76, z - 39) <= 11.0) return 0.08;
    if (Math.hypot(x - 80, z - 2) <= 10.0) return 0.08;
    if (this.isOnWalkwayOrCanal(x, z, 0) && !this.isOnTrainTrack(x, z, 2.2)) return 0.08;

    return 0.0;
  }

  resolveCollisions(pos, entityRadius = 0.55) {
    // 1. Standard circular & box colliders
    for (const c of this.colliders) {
      if (c.type === 'circle') {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz);
        const minDist = c.r + entityRadius;
        if (dist < minDist) {
          const nx = dist > 0.0001 ? dx / dist : 1;
          const nz = dist > 0.0001 ? dz / dist : 0;
          pos.x = c.x + nx * minDist;
          pos.z = c.z + nz * minDist;
        }
      } else if (c.type === 'box') {
        const closestX = THREE.MathUtils.clamp(pos.x, c.x - c.hw, c.x + c.hw);
        const closestZ = THREE.MathUtils.clamp(pos.z, c.z - c.hd, c.z + c.hd);
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < entityRadius * entityRadius) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const push = entityRadius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            const penX = c.hw + entityRadius - Math.abs(pos.x - c.x);
            const penZ = c.hd + entityRadius - Math.abs(pos.z - c.z);
            if (penX < penZ) {
              pos.x += pos.x >= c.x ? penX : -penX;
            } else {
              pos.z += pos.z >= c.z ? penZ : -penZ;
            }
          }
        }
      }
    }

    // 2. Retaining stone wall around +1.8m Castle Plateau (leave open ONLY at front Royal Staircase!)
    const inStairCorridor =
      pos.x >= CASTLE_PLATEAU.stairMinX + 0.35 &&
      pos.x <= CASTLE_PLATEAU.stairMaxX - 0.35 &&
      pos.z <= CASTLE_PLATEAU.stairBottomZ + 1.0 &&
      pos.z >= CASTLE_PLATEAU.stairTopZ - 1.5;

    if (!inStairCorridor) {
      const dxp = pos.x - CASTLE_PLATEAU.x;
      const dzp = pos.z - CASTLE_PLATEAU.z;
      const dp = Math.hypot(dxp, dzp);
      const currentY = pos.y ?? 0;

        if (currentY < CASTLE_PLATEAU.height - 0.35) {
          // On lower meadow: prevent walking through vertical plateau cliff wall
          const minOut = CASTLE_PLATEAU.radius + entityRadius;
          if (dp < minOut && dp > 0.001) {
            pos.x = CASTLE_PLATEAU.x + (dxp / dp) * minOut;
            pos.z = CASTLE_PLATEAU.z + (dzp / dp) * minOut;
          }
        } else if (currentY >= CASTLE_PLATEAU.height - 0.15) {
          // Only apply the upper-terrace parapet rim check to entities actually near the plateau edge
          const maxIn = CASTLE_PLATEAU.radius - 0.45 - entityRadius;
            if (dp > maxIn && dp <= CASTLE_PLATEAU.radius + 0.4 && dp > 0.001) {
              pos.x = CASTLE_PLATEAU.x + (dxp / dp) * maxIn;
              pos.z = CASTLE_PLATEAU.z + (dzp / dp) * maxIn;
            }
          }
        }

        // 3. Prevent falling off outer island edge
        const r = Math.hypot(pos.x, pos.z);
        if (r > PARK_CONSTANTS.OUTER_PARK_R - 2.0) {
          const s = (PARK_CONSTANTS.OUTER_PARK_R - 2.0) / r;
          pos.x *= s;
          pos.z *= s;
        }
      }
    }
