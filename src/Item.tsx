import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { Mesh, Group } from 'three'

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const Item: React.FC<ItemProps> = ({ position = [0, 0, 0], scale = 1 }) => {
  const groupRef = useRef<Group>(null)
  const crystalRef = useRef<Mesh>(null)

  // ゆっくり回転するアニメーション
  useFrame((_state, delta) => {
    if (crystalRef.current) {
      crystalRef.current.rotation.y += delta * 0.5
    }
  })

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* 台座 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.5, 0.3, 8]} />
          <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.3} />
        </mesh>
      </RigidBody>

      {/* クリスタル本体（回転） */}
      <mesh ref={crystalRef} position={[0, 0.8, 0]} castShadow>
        <octahedronGeometry args={[0.4]} />
        <meshStandardMaterial
          color="#4fc3f7"
          emissive="#0288d1"
          emissiveIntensity={0.3}
          metalness={0.2}
          roughness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* ポイントライト（クリスタルの発光表現） */}
      <pointLight
        position={[0, 0.8, 0]}
        color="#4fc3f7"
        intensity={2}
        distance={3}
      />
    </group>
  )
}
