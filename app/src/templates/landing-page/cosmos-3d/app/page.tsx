"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { ParticleSphere } from "@/components/particle-sphere"

export default function Home() {
  return (
    <div className="w-full h-screen bg-black relative">
      <div className="fixed top-20 left-0 right-0 z-10 p-6">
        <h1 className="max-w-[750px] mx-auto text-white text-center font-instrument-serif px-6 md:text-6xl text-4xl tracking-tight font-normal">
          The cosmos is within us. We are made of star-stuff. We are a way for the universe to know itself.
        </h1>
      </div>

      <Canvas camera={{ position: [-10, 1.5, 10], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <ParticleSphere />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
    </div>
  )
}
