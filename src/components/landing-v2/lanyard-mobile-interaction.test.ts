import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RAPIER from "@react-three/rapier/node_modules/@dimforge/rapier3d-compat";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  LANYARD_CARD_LAYOUT,
  stabilizeLanyardAngularVelocity,
} from "./lanyard-card-layout";

const readComponent = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/components/landing-v2/${name}`), "utf8");

const ZERO = { x: 0, y: 0, z: 0 } as const;

function projectCardToCamera(
  card: RAPIER.RigidBody,
  camera: THREE.PerspectiveCamera,
) {
  const {
    cardWidth,
    cardHeight,
    cardDepth,
    cardVisualOffsetY,
  } = LANYARD_CARD_LAYOUT;
  const position = card.translation();
  const rotation = card.rotation();
  const worldPosition = new THREE.Vector3(position.x, position.y, position.z);
  const worldRotation = new THREE.Quaternion(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const projectedX: number[] = [];
  const projectedY: number[] = [];

  for (const x of [-cardWidth / 2, cardWidth / 2]) {
    for (const y of [
      cardVisualOffsetY - cardHeight / 2,
      cardVisualOffsetY + cardHeight / 2,
    ]) {
      for (const z of [-cardDepth / 2, cardDepth / 2]) {
        const projected = new THREE.Vector3(x, y, z)
          .applyQuaternion(worldRotation)
          .add(worldPosition)
          .project(camera);
        projectedX.push(projected.x);
        projectedY.push(projected.y);
      }
    }
  }

  return {
    bottom: Math.min(...projectedY),
    left: Math.min(...projectedX),
    right: Math.max(...projectedX),
    top: Math.max(...projectedY),
  };
}

async function simulateDanglingCard() {
  await RAPIER.init();
  const {
    ropeSegmentLength,
    ropeSegmentCount,
    cardJointY,
    fixedAnchorY,
    initialImpulse,
    cameraDistance,
    cameraFovDegrees,
  } = LANYARD_CARD_LAYOUT;
  const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
  try {
    world.timestep = 1 / 60;

    const fixed = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, fixedAnchorY, 0),
    );
    const ropeBodies = Array.from({ length: ropeSegmentCount }, (_, index) => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, fixedAnchorY - ropeSegmentLength * (index + 1), 0)
          .setLinearDamping(2)
          .setAngularDamping(2),
      );
      world.createCollider(RAPIER.ColliderDesc.ball(0.1), body);
      return body;
    });
    const cardBodyY =
      fixedAnchorY - ropeSegmentLength * ropeSegmentCount - cardJointY;
    const card = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, cardBodyY, 0)
        .setLinearDamping(2.5)
        .setAngularDamping(2.5),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.85, 1.2, 0.02), card);

    let previousBody = fixed;
    for (const ropeBody of ropeBodies) {
      world.createImpulseJoint(
        RAPIER.JointData.rope(ropeSegmentLength, ZERO, ZERO),
        previousBody,
        ropeBody,
        true,
      );
      previousBody = ropeBody;
    }
    world.createImpulseJoint(
      RAPIER.JointData.spherical(ZERO, { x: 0, y: cardJointY, z: 0 }),
      previousBody,
      card,
      true,
    );

    const camera = new THREE.PerspectiveCamera(
      cameraFovDegrees,
      1,
      0.1,
      100,
    );
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const scratchAngularVelocity = new THREE.Vector3();
    const scratchEuler = new THREE.Euler();
    const scratchQuaternion = new THREE.Quaternion();
    let lowestProjectedPoint = Number.POSITIVE_INFINITY;
    let highestProjectedPoint = Number.NEGATIVE_INFINITY;
    let leftmostProjectedPoint = Number.POSITIVE_INFINITY;
    let rightmostProjectedPoint = Number.NEGATIVE_INFINITY;
    for (let step = 0; step < 600; step += 1) {
      if (step === 48) {
        card.applyImpulse(initialImpulse, true);
      }
      card.setAngvel(
        stabilizeLanyardAngularVelocity(
          card.angvel(),
          card.rotation(),
          scratchEuler,
          scratchQuaternion,
          scratchAngularVelocity,
        ),
        false,
      );
      world.step();
      const frame = projectCardToCamera(card, camera);
      lowestProjectedPoint = Math.min(lowestProjectedPoint, frame.bottom);
      highestProjectedPoint = Math.max(highestProjectedPoint, frame.top);
      leftmostProjectedPoint = Math.min(leftmostProjectedPoint, frame.left);
      rightmostProjectedPoint = Math.max(rightmostProjectedPoint, frame.right);
    }

    return {
      cardSettled: card.isSleeping(),
      highestProjectedPoint,
      leftmostProjectedPoint,
      lowestProjectedPoint,
      rapierVersion: RAPIER.version(),
      rightmostProjectedPoint,
    };
  } finally {
    world.free();
  }
}

describe("lanyard mobile interactions", () => {
  it("lets vertical gestures scroll and releases the 3D drag on cancellation", () => {
    const source = readComponent("lanyard-card.tsx");

    expect(source).toContain('touchAction: "pan-y pinch-zoom"');
    expect(source).toContain("onPointerCancel");
    expect(source).toContain("onLostPointerCapture");
    expect(source).not.toContain('touchAction: "none"');
  });

  it("keeps the business card inside the camera while Rapier swings and settles it", async () => {
    const simulation = await simulateDanglingCard();

    // NDC -1/+1 are the exact camera edges. Keep 5% breathing room throughout
    // the same initial impulse and 10 seconds of physics used by the live scene.
    expect(simulation.lowestProjectedPoint).toBeGreaterThan(-0.95);
    expect(simulation.highestProjectedPoint).toBeLessThan(0.95);
    expect(simulation.leftmostProjectedPoint).toBeGreaterThan(-0.95);
    expect(simulation.rightmostProjectedPoint).toBeLessThan(0.95);
    expect(simulation.cardSettled).toBe(true);
    expect(simulation.rapierVersion).toBe("0.19.2");
  }, 15_000);

  it("applies the same scroll-safe contract to the lower badge", () => {
    const source = readComponent("lanyard-badge.tsx");

    expect(source).toContain('touchAction: runPhysics ? "pan-y pinch-zoom" : "auto"');
    expect(source).toContain("onPointerCancel");
    expect(source).toContain("onLostPointerCapture");
    expect(source).not.toContain('touchAction: runPhysics ? "none"');
  });

  it("keeps the interactive canvas within a reduced adaptive render budget", () => {
    const lanyard = readComponent("lanyard-card.tsx");
    const journey = readComponent("how-it-works-scene.tsx");

    expect(lanyard).toContain("<AdaptiveDpr />");
    expect(lanyard).toContain("dpr={[1, 1.35]}");
    expect(lanyard).toContain("<Environment resolution={64}>");
    expect(lanyard).toContain("const bandPoints = useRef");

    expect(journey).toContain('frameloop={sceneActive ? "always" : "never"}');
    expect(journey).toContain("setSceneActive(isNearViewport)");
    expect(journey).toContain("<AdaptiveDpr />");
  });
});
