/**
 * 開発環境用エントリーポイント
 *
 * ローカル開発時（npm run dev）に使用されます。
 * 本番ビルド（npm run build）では使用されません。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { OrbitControls } from '@react-three/drei'
import { Item, ITEM_MODEL_SCALE } from './Item'

const previewCameraPosition: [number, number, number] = [0, 4.8 * ITEM_MODEL_SCALE, 17.5 * ITEM_MODEL_SCALE]
const previewTarget: [number, number, number] = [0, 4 * ITEM_MODEL_SCALE, 0]

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: previewCameraPosition, fov: 40 }}>
        <Physics>
          <ambientLight intensity={0.45} />
          <directionalLight
            position={[4, 6, 6]}
            intensity={1.1}
            castShadow
          />
          <Item position={[0, 0, 0]} />
          {/* 地面 */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
          <OrbitControls target={previewTarget} />
        </Physics>
      </Canvas>
    </div>
  </StrictMode>,
)
