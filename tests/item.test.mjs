import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const ITEM_SOURCE_PATH = new URL('../src/Item.tsx', import.meta.url)

test('ControlButton uses stable layout references instead of inline tuple literals', async () => {
  const source = await readFile(ITEM_SOURCE_PATH, 'utf8')
  const controlButtonTags = source.match(/<ControlButton[\s\S]*?\/>/g) ?? []

  assert.equal(controlButtonTags.length, 5)
  assert.match(source, /const DEFAULT_CONTROL_BUTTON_SIZE: \[number, number, number\] = \[0\.58, 0\.18, 0\.34\]/)
  assert.match(source, /const CONTROL_BUTTON_LAYOUTS = \{/)
  assert.match(source, /chairToggle: \{/)

  for (const tag of controlButtonTags) {
    assert.doesNotMatch(tag, /position=\{\[/)
    assert.doesNotMatch(tag, /size=\{\[/)
  }
})

test('slot machine keeps the chair hidden by default and toggles a widened chair in front of the slot', async () => {
  const source = await readFile(ITEM_SOURCE_PATH, 'utf8')
  assert.match(source, /import \{ CuboidCollider, RigidBody \} from '@react-three\/rapier'/)
  assert.match(source, /const CHAIR_POSITION: \[number, number, number\] = \[0, 0, 2\.45\]/)
  assert.match(source, /const CHAIR_VISIBLE_POSITION: \[number, number, number\] = \[CHAIR_POSITION\[0\], CHAIR_POSITION\[1\], CHAIR_POSITION\[2\] \+ 0\.8\]/)
  assert.match(source, /const CHAIR_SEAT_SIZE: \[number, number, number\] = \[1\.67, 0\.48, 1\.44\]/)
  assert.match(source, /const CHAIR_SEAT_COLLIDER_ARGS: \[number, number, number\] = \[0\.835, 0\.24, 0\.72\]/)
  assert.match(source, /const CHAIR_SEAT_POSITION: \[number, number, number\] = \[0, 4\.04, 0\]/)
  assert.match(source, /const CHAIR_BACKREST_SIZE: \[number, number, number\] = \[1\.67, 1\.8, 0\.16\]/)
  assert.match(source, /const CHAIR_BACKREST_COLLIDER_ARGS: \[number, number, number\] = \[0\.835, 0\.9, 0\.08\]/)
  assert.match(source, /const CHAIR_BACKREST_POSITION: \[number, number, number\] = \[0, 5\.16, 0\.64\]/)
  assert.match(source, /const CHAIR_LEG_SIZE: \[number, number, number\] = \[0\.16, 3\.8, 0\.16\]/)
  assert.match(source, /const CHAIR_LEG_COLLIDER_ARGS: \[number, number, number\] = \[0\.08, 1\.9, 0\.08\]/)
  assert.match(source, /\[-0\.63, 1\.9, -0\.56\]/)
  assert.match(source, /\[0\.63, 1\.9, 0\.56\]/)
  assert.match(source, /const \[isChairVisible, setIsChairVisible\] = useState\(false\)/)
  assert.match(source, /const toggleChair = useCallback\(\(\) => \{\s*setIsChairVisible\(\(current\) => !current\)\s*\}, \[\]\)/)
  assert.match(source, /label=\{isChairVisible \? 'CHAIR OFF' : 'CHAIR ON'\}/)
  assert.match(source, /position=\{CONTROL_BUTTON_LAYOUTS\.chairToggle\.position\}/)
  assert.match(source, /size=\{CONTROL_BUTTON_LAYOUTS\.chairToggle\.size\}/)
  assert.match(source, /isChairVisible \? \(\s*<RigidBody type="fixed" colliders=\{false\}>[\s\S]*?<group position=\{CHAIR_VISIBLE_POSITION\}>/)
  assert.match(source, /<CuboidCollider args=\{CHAIR_SEAT_COLLIDER_ARGS\} position=\{CHAIR_SEAT_POSITION\} \/>/)
  assert.match(source, /<CuboidCollider args=\{CHAIR_BACKREST_COLLIDER_ARGS\} position=\{CHAIR_BACKREST_POSITION\} \/>/)
  assert.match(source, /<mesh castShadow receiveShadow position=\{CHAIR_SEAT_POSITION\}>/)
  assert.match(source, /<mesh castShadow receiveShadow position=\{CHAIR_BACKREST_POSITION\}>/)
  assert.match(source, /CHAIR_LEG_POSITIONS\.map\(\(chairLegPosition, chairLegIndex\) => \(/)
  assert.doesNotMatch(source, /pedestalToggle/)
  assert.doesNotMatch(source, /HIGH_PEDESTAL_HEIGHT|getNextPedestalHeight|resolvePedestalBodyProps/)
  assert.doesNotMatch(source, /label=\{isPedestalHigh \? 'HIGH' : 'LOW'\}/)
})
