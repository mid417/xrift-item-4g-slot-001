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
