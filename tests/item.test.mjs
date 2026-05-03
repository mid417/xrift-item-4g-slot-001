import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const ITEM_SOURCE_PATH = new URL('../src/Item.tsx', import.meta.url)

test('ControlButton uses stable layout references instead of inline tuple literals', async () => {
  const source = await readFile(ITEM_SOURCE_PATH, 'utf8')
  const controlButtonTags = source.match(/<ControlButton[\s\S]*?\/>/g) ?? []

  assert.equal(controlButtonTags.length, 4)
  assert.match(source, /const DEFAULT_CONTROL_BUTTON_SIZE: \[number, number, number\] = \[0\.58, 0\.18, 0\.34\]/)
  assert.match(source, /const CONTROL_BUTTON_LAYOUTS = \{/)

  for (const tag of controlButtonTags) {
    assert.doesNotMatch(tag, /position=\{\[/)
    assert.doesNotMatch(tag, /size=\{\[/)
  }
})

test('slot machine keeps the raised chair offset from the slot without reintroducing the pedestal toggle UI', async () => {
  const source = await readFile(ITEM_SOURCE_PATH, 'utf8')
  assert.match(source, /import \{ CuboidCollider, RigidBody \} from '@react-three\/rapier'/)
  assert.match(source, /const CHAIR_POSITION: \[number, number, number\] = \[0, 0, 2\.45\]/)
  assert.match(source, /const CHAIR_SEAT_SIZE: \[number, number, number\] = \[1\.18, 0\.48, 1\.02\]/)
  assert.match(source, /const CHAIR_SEAT_COLLIDER_ARGS: \[number, number, number\] = \[0\.59, 0\.24, 0\.51\]/)
  assert.match(source, /const CHAIR_SEAT_POSITION: \[number, number, number\] = \[0, 4\.04, 0\]/)
  assert.match(source, /const CHAIR_BACKREST_SIZE: \[number, number, number\] = \[1\.18, 1\.8, 0\.16\]/)
  assert.match(source, /const CHAIR_BACKREST_COLLIDER_ARGS: \[number, number, number\] = \[0\.59, 0\.9, 0\.08\]/)
  assert.match(source, /const CHAIR_BACKREST_POSITION: \[number, number, number\] = \[0, 5\.16, 0\.43\]/)
  assert.match(source, /const CHAIR_LEG_SIZE: \[number, number, number\] = \[0\.16, 3\.8, 0\.16\]/)
  assert.match(source, /const CHAIR_LEG_COLLIDER_ARGS: \[number, number, number\] = \[0\.08, 1\.9, 0\.08\]/)
  assert.match(source, /\[-0\.43, 1\.9, -0\.35\]/)
  assert.match(source, /\[0\.43, 1\.9, 0\.35\]/)
  assert.match(source, /<RigidBody type="fixed" colliders=\{false\}>[\s\S]*?<group position=\{CHAIR_POSITION\}>/)
  assert.match(source, /<CuboidCollider args=\{CHAIR_SEAT_COLLIDER_ARGS\} position=\{CHAIR_SEAT_POSITION\} \/>/)
  assert.match(source, /<CuboidCollider args=\{CHAIR_BACKREST_COLLIDER_ARGS\} position=\{CHAIR_BACKREST_POSITION\} \/>/)
  assert.match(source, /<mesh castShadow receiveShadow position=\{CHAIR_SEAT_POSITION\}>/)
  assert.match(source, /<mesh castShadow receiveShadow position=\{CHAIR_BACKREST_POSITION\}>/)
  assert.match(source, /CHAIR_LEG_POSITIONS\.map\(\(chairLegPosition, chairLegIndex\) => \(/)
  assert.doesNotMatch(source, /pedestalToggle/)
  assert.doesNotMatch(source, /HIGH_PEDESTAL_HEIGHT|getNextPedestalHeight|resolvePedestalBodyProps/)
  assert.doesNotMatch(source, /label=\{isPedestalHigh \? 'HIGH' : 'LOW'\}/)
})
