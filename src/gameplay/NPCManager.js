import * as THREE from 'three';
import {
  JELLYCAT_ROSTER,
  animateJellycatRig,
  createJellycatCharacter,
} from '../world/CharacterFactory.js';

export class NPCManager {
  constructor(scene, ui, audio, layout) {
    this.scene = scene;
    this.ui = ui;
    this.audio = audio;
    this.layout = layout;
    this.npcs = [];

    // Curated asymmetric placements across all 5 themed zones & the +1.8m elevated castle terrace
    const placements = [
      { id: 'aubergine_standard', pos: new THREE.Vector3(-8.8, 0.08, -19.0), rot: 0.35 },
      { id: 'aubergine_giant', pos: new THREE.Vector3(-3.2, 0.08, -19.0), rot: -0.35 },
      { id: 'aubergine_king', pos: new THREE.Vector3(-8.5, 1.88, -34.5), rot: 0.2 },
      { id: 'aubergine_magician', pos: new THREE.Vector3(-3.5, 1.88, -34.5), rot: -0.2 },
      { id: 'aubergine_astronaut', pos: new THREE.Vector3(61.0, 0.08, -33.0), rot: -0.8 },
      { id: 'aubergine_cool', pos: new THREE.Vector3(66.0, 0.08, -3.5), rot: -1.1 },
      { id: 'aubergine_baby', pos: new THREE.Vector3(15.5, 0.08, 94.0), rot: -0.6 },
      { id: 'avocado', pos: new THREE.Vector3(59.5, 0.08, -53.0), rot: 0.5 },
      { id: 'tomato', pos: new THREE.Vector3(16.5, 0.08, -13.5), rot: -0.6 },
      { id: 'sweetcorn', pos: new THREE.Vector3(-28.0, 0.08, 21.0), rot: 0.4 },
      { id: 'leek', pos: new THREE.Vector3(-14.5, 0.08, 51.0), rot: 0.25 },
      { id: 'bartholomew_bear', pos: new THREE.Vector3(12.5, 0.08, 25.0), rot: 0.8 },
      { id: 'bashful_bunny', pos: new THREE.Vector3(-73.5, 0.08, 6.5), rot: 1.3 },
      { id: 'croissant', pos: new THREE.Vector3(63.5, 0.08, 34.0), rot: -0.9 },
      { id: 'coffee_cup', pos: new THREE.Vector3(3.5, 0.08, 35.0), rot: -0.4 },
      { id: 'boiled_egg', pos: new THREE.Vector3(5.8, 0.08, 8.5), rot: -0.4 },
    ];

    for (const p of placements) {
      const info = JELLYCAT_ROSTER.find((r) => r.id === p.id);
      if (!info) continue;
      const mesh = createJellycatCharacter(p.id, { scale: 1.02 });
      const groundY = this.layout.getGroundHeight(p.pos.x, p.pos.z);
      mesh.position.set(p.pos.x, groundY, p.pos.z);
      mesh.rotation.y = p.rot;
      this.scene.add(mesh);

      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16),
        new THREE.MeshStandardMaterial({ color: '#ffd466', emissive: '#ffa826', emissiveIntensity: 0.45 })
      );
      marker.position.y = 1.9;
      mesh.add(marker);

      this.npcs.push({
        info,
        mesh,
        marker,
        homePos: mesh.position.clone(),
        wanderAngle: Math.random() * Math.PI * 2,
        dialogueIdx: 0,
      });
    }
  }

  getNearestNpc(playerPos) {
    let best = null;
    let bestDist = Infinity;
    for (const npc of this.npcs) {
      const d = playerPos.distanceTo(npc.mesh.position);
      if (d < 3.4 && d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    return best;
  }

  talkTo(npc) {
    const line = npc.info.dialogues[npc.dialogueIdx % npc.info.dialogues.length];
    npc.dialogueIdx++;
    this.audio?.playSfx('squeak', 0.45);
    this.ui.showDialogue(npc.info.emoji, npc.info.name, line);

    const newlyUnlocked = this.ui.unlockDex(npc.info.id);
    if (newlyUnlocked) {
      this.ui.addCoins(15);
      this.ui.toast(`📖 首次结识 ${npc.info.name}！图鉴已点亮，获赠 +15 茄币！`);
    }
  }

  unlockVisibleInCamera(camera) {
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    const projMatrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projMatrix);

    const discovered = [];
    for (const npc of this.npcs) {
      const pos = npc.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      if (pos.distanceTo(camera.position) < 42 && frustum.containsPoint(pos)) {
        if (this.ui.unlockDex(npc.info.id)) {
          discovered.push(npc.info.name);
        }
      }
    }
    return discovered;
  }

  update(dt, elapsed, playerPos) {
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      npc.marker.rotation.y += dt * 2.2;
      npc.marker.position.y = 1.9 + Math.sin(elapsed * 3 + i) * 0.1;

      const dist = npc.mesh.position.distanceTo(playerPos);
      if (dist < 6.0) {
        const targetAngle = Math.atan2(
          playerPos.x - npc.mesh.position.x,
          playerPos.z - npc.mesh.position.z
        );
        npc.mesh.rotation.y = THREE.MathUtils.lerp(npc.mesh.rotation.y, targetAngle, dt * 4);
        animateJellycatRig(npc.mesh, elapsed + i, 0, false, dist < 3.5);
      } else {
        npc.wanderAngle += dt * 0.42;
        const tx = npc.homePos.x + Math.cos(npc.wanderAngle) * 0.65;
        const tz = npc.homePos.z + Math.sin(npc.wanderAngle) * 0.65;
        npc.mesh.position.x = THREE.MathUtils.lerp(npc.mesh.position.x, tx, dt * 1.1);
        npc.mesh.position.z = THREE.MathUtils.lerp(npc.mesh.position.z, tz, dt * 1.1);
        this.layout.resolveCollisions(npc.mesh.position, 0.55);
        npc.mesh.position.y = this.layout.getGroundHeight(npc.mesh.position.x, npc.mesh.position.z);
        animateJellycatRig(npc.mesh, elapsed + i, 0.35, false, false);
      }
    }
  }
}
