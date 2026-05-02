import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/itemAnimation.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
})
const { advanceReelAnimation } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`)

test('advanceReelAnimation leaves stopped reels untouched', () => {
  const reel = {
    position: 3,
    targetIndex: 3,
    stopAt: null,
    isSpinning: false,
  }

  assert.equal(advanceReelAnimation(reel, 1 / 60), reel)
})

test('advanceReelAnimation advances free-spinning reels at a fixed speed', () => {
  const reel = {
    position: 5,
    targetIndex: 0,
    stopAt: null,
    isSpinning: true,
  }

  assert.deepEqual(advanceReelAnimation(reel, 0.5), {
    ...reel,
    position: 14,
  })
})

test('advanceReelAnimation snaps to the target once the stop threshold is reached', () => {
  const reel = {
    position: 10.995,
    targetIndex: 11,
    stopAt: 11,
    isSpinning: true,
  }

  assert.deepEqual(advanceReelAnimation(reel, 1 / 60), {
    position: 11,
    targetIndex: 11,
    stopAt: null,
    isSpinning: false,
  })
})
