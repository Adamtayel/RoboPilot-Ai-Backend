"use client";

/**
 * The one place this page spends boldness: a dev board rendered in 3D with
 * live signal traces running from the MCU out to its peripherals.
 *
 * Why a board and not an abstract particle field: this is literally what the
 * product reasons about. A plan is an MCU, a set of peripherals, and whether
 * a signal can legally travel between them at a given logic level. The pulses
 * travelling along each trace are the compatibility check, drawn.
 *
 * Loaded only by Hero.tsx, and only when the viewport is wide enough and the
 * visitor has not asked for reduced motion — see that file. Nothing here is
 * imported on mobile, so three.js never reaches those devices.
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";

const SIGNAL = "#3DE1C8";
const SOLDER = "#C98A54";
const BOARD = "#12463F";
const BOARD_EDGE = "#1C5B52";

/** Resting pose. The board's own tilt ADDS to the camera's elevation rather
 *  than cancelling it, so this stays near zero: the camera already looks down
 *  from about 24 degrees, which is the bench angle we want. Pushing the tilt
 *  further just flattens the board into a plan view with no depth. The yaw is
 *  what makes it read as an object rather than a diagram. */
const BASE_TILT_X = -0.04;
const BASE_YAW_Y = -0.46;

/** Peripheral modules, placed around the board like a real breakout layout. */
const PERIPHERALS: {
  id: string;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  /** Trace waypoints from the MCU edge to this module, in board space. */
  trace: [number, number, number][];
}[] = [
  {
    id: "ultrasonic",
    label: "HC-SR04",
    position: [-2.15, 0.16, -1.05],
    size: [0.95, 0.2, 0.42],
    trace: [
      [-0.5, 0.075, -0.35],
      [-1.25, 0.075, -0.35],
      [-1.25, 0.075, -1.05],
      [-1.75, 0.075, -1.05],
    ],
  },
  {
    id: "imu",
    label: "MPU6050",
    position: [-2.05, 0.14, 0.95],
    size: [0.6, 0.16, 0.6],
    trace: [
      [-0.5, 0.075, 0.3],
      [-1.4, 0.075, 0.3],
      [-1.4, 0.075, 0.95],
      [-1.8, 0.075, 0.95],
    ],
  },
  {
    id: "driver",
    label: "L298N",
    position: [2.2, 0.2, -0.85],
    size: [1.0, 0.28, 0.8],
    trace: [
      [0.5, 0.075, -0.3],
      [1.3, 0.075, -0.3],
      [1.3, 0.075, -0.85],
      [1.75, 0.075, -0.85],
    ],
  },
  {
    id: "servo",
    label: "SG90",
    position: [2.1, 0.17, 1.0],
    size: [0.7, 0.22, 0.5],
    trace: [
      [0.5, 0.075, 0.35],
      [1.45, 0.075, 0.35],
      [1.45, 0.075, 1.0],
      [1.8, 0.075, 1.0],
    ],
  },
];

/** A glowing dot that walks the trace, then restarts — one signal packet. */
function SignalPulse({
  curve,
  offset,
  speed,
}: {
  curve: THREE.CatmullRomCurve3;
  offset: number;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime * speed + offset) % 1;
    const point = curve.getPoint(t);
    ref.current.position.copy(point);
    // Fade in at the start of the run and out at the end, so packets arrive
    // rather than blinking out of existence mid-trace.
    const edge = Math.min(t, 1 - t) * 6;
    const material = ref.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.min(1, edge);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.052, 12, 12]} />
      <meshBasicMaterial color={SIGNAL} transparent opacity={0} toneMapped={false} />
    </mesh>
  );
}

function Trace({ points, pulseSpeed }: { points: [number, number, number][]; pulseSpeed: number }) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.02),
    [points]
  );
  const linePoints = useMemo(() => curve.getPoints(48), [curve]);

  return (
    <group>
      <Line points={linePoints} color={SIGNAL} lineWidth={2} transparent opacity={0.75} />
      <SignalPulse curve={curve} offset={0} speed={pulseSpeed} />
      <SignalPulse curve={curve} offset={0.55} speed={pulseSpeed} />
    </group>
  );
}

/** A row of header pins, the detail that makes a box read as a real module. */
function PinHeader({
  count,
  position,
  rotation = 0,
}: {
  count: number;
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[(i - (count - 1) / 2) * 0.1, 0, 0]}>
          <boxGeometry args={[0.045, 0.1, 0.045]} />
          <meshStandardMaterial color={SOLDER} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Board() {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });

  useFrame(({ pointer, clock }) => {
    if (!group.current) return;
    // Track the cursor, but gently and within a tight range — an instrument
    // responding to a hand, not a toy spinning to face you.
    target.current.x = THREE.MathUtils.lerp(target.current.x, pointer.y * 0.14, 0.045);
    target.current.y = THREE.MathUtils.lerp(target.current.y, pointer.x * 0.3, 0.045);
    group.current.rotation.x = BASE_TILT_X + target.current.x;
    group.current.rotation.y = BASE_YAW_Y + target.current.y + Math.sin(clock.elapsedTime * 0.14) * 0.05;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.035;
  });

  return (
    <group ref={group} rotation={[BASE_TILT_X, BASE_YAW_Y, 0]} scale={0.82}>
      {/* PCB substrate */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.2, 2.2]} />
        <meshStandardMaterial color={BOARD} metalness={0.2} roughness={0.62} />
      </mesh>
      {/* A lighter rim, like exposed fibreglass on a cut edge */}
      <mesh position={[0, -0.063, 0]}>
        <boxGeometry args={[3.04, 0.012, 2.24]} />
        <meshStandardMaterial color={BOARD_EDGE} metalness={0.1} roughness={0.9} />
      </mesh>

      {/* MCU package with its lid marking */}
      <mesh position={[0, 0.135, 0]}>
        <boxGeometry args={[0.95, 0.15, 0.95]} />
        <meshStandardMaterial color="#1A2128" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.213, 0]}>
        <boxGeometry args={[0.62, 0.008, 0.62]} />
        <meshStandardMaterial color="#2A333D" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Shield can, the second-tallest thing on a real ESP32 devkit */}
      <mesh position={[0.0, 0.16, -0.78]}>
        <boxGeometry args={[1.2, 0.2, 0.42]} />
        <meshStandardMaterial color="#8E9AA6" metalness={0.95} roughness={0.28} />
      </mesh>

      {/* Header rails down both long edges */}
      <PinHeader count={14} position={[0, 0.11, 0.98]} />
      <PinHeader count={14} position={[0, 0.11, -0.98]} />

      {/* USB connector */}
      <mesh position={[-1.42, 0.12, 0]}>
        <boxGeometry args={[0.3, 0.16, 0.42]} />
        <meshStandardMaterial color="#9AA6B2" metalness={0.92} roughness={0.3} />
      </mesh>

      {/* Peripheral modules + their traces */}
      {PERIPHERALS.map((p, i) => (
        <group key={p.id}>
          <mesh position={p.position}>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color="#16202A" metalness={0.4} roughness={0.55} />
          </mesh>
          {/* A lit status LED on each module */}
          <mesh position={[p.position[0], p.position[1] + p.size[1] / 2 + 0.02, p.position[2] + p.size[2] / 2 - 0.08]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshBasicMaterial color={SIGNAL} toneMapped={false} />
          </mesh>
          <Trace points={p.trace} pulseSpeed={0.22 + i * 0.035} />
        </group>
      ))}

      {/* Decorative surface traces that go nowhere in particular, as on a real board */}
      <Line
        points={[
          [-1.1, 0.065, 0.82],
          [-0.2, 0.065, 0.82],
          [-0.2, 0.065, 0.55],
          [0.9, 0.065, 0.55],
        ]}
        color={SOLDER}
        lineWidth={1}
        transparent
        opacity={0.3}
      />
      <Line
        points={[
          [1.2, 0.065, -0.72],
          [1.2, 0.065, 0.1],
          [0.75, 0.065, 0.1],
        ]}
        color={SOLDER}
        lineWidth={1}
        transparent
        opacity={0.25}
      />
    </group>
  );
}

export default function BoardScene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0.3, 1.75, 5.2], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      {/* Lab lighting: a cool key from above, a copper rim from behind, and a
          dim fill so the board reads as a solid object rather than a silhouette. */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 6, 4]} intensity={2.1} color="#D6E6F2" />
      <directionalLight position={[-4, 3, -5]} intensity={1.6} color={SOLDER} />
      <pointLight position={[0, 1.4, 0.6]} intensity={3} color={SIGNAL} distance={5} />
      <Board />
    </Canvas>
  );
}
