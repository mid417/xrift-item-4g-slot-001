import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const STRIP_LENGTH = 21

async function importTypeScriptModule(relativePath, replacements = []) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const rewritten = replacements.reduce((code, { specifier, url }) => {
    return code
      .split(`from '${specifier}'`)
      .join(`from ${JSON.stringify(url)}`)
      .split(`from "${specifier}"`)
      .join(`from ${JSON.stringify(url)}`)
  }, outputText)

  return import(`data:text/javascript,${encodeURIComponent(rewritten)}`)
}

const { advanceReelAnimation, resolveStopPosition, SPIN_SPEED } = await importTypeScriptModule('../src/itemAnimation.ts')
const paylinesModuleUrl = `data:text/javascript,${encodeURIComponent(
  (
    await readFile(new URL('../src/paylines.ts', import.meta.url), 'utf8').then((source) =>
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
        },
      }).outputText,
    )
  ),
)}`
const reelStripsModuleUrl = `data:text/javascript,${encodeURIComponent(
  (
    await readFile(new URL('../src/reelStrips.ts', import.meta.url), 'utf8').then((source) =>
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
        },
      }).outputText,
    )
  ),
)}`
const { getReachableStopIndices, resolveStopIndex } = await importTypeScriptModule('../src/slotLogic.ts', [
  { specifier: './paylines', url: paylinesModuleUrl },
  { specifier: './reelStrips', url: reelStripsModuleUrl },
])

function normalizeStoppedPosition(position, stripLength = STRIP_LENGTH) {
  return ((Math.round(position) % stripLength) + stripLength) % stripLength
}

function assertAlmostEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`)
}

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

  const advanced = advanceReelAnimation(reel, 0.5)

  assert.equal(advanced.targetIndex, reel.targetIndex)
  assert.equal(advanced.stopAt, reel.stopAt)
  assert.equal(advanced.isSpinning, reel.isSpinning)
  assertAlmostEqual(advanced.position, 5 + 0.5 * SPIN_SPEED)
})

test('resolveStopPosition keeps the animation endpoint on the same wrapped stop index', () => {
  assert.equal(resolveStopPosition(10.2, 11, 21), 11)
  assert.equal(resolveStopPosition(19.2, 1, 21), 22)
})

test('resolveStopPosition preserves phase while guaranteeing minimum travel after stop request', () => {
  const stopAt = resolveStopPosition(19.2, 1, STRIP_LENGTH, 6)

  assert.equal(stopAt, 43)
  assert.equal(normalizeStoppedPosition(stopAt), 1)
  assert.ok(stopAt - 19.2 >= 6)
})

test('stop resolution keeps integer boundaries stable before and after crossing them', () => {
  assert.deepEqual(getReachableStopIndices(0, 10.999999), [11, 12, 13, 14, 15])
  assert.deepEqual(getReachableStopIndices(0, 11), [11, 12, 13, 14, 15])
  assert.deepEqual(getReachableStopIndices(0, 11.000002), [12, 13, 14, 15, 16])
})

test('resolveStopPosition stays aligned with stop normalization around integer boundaries', () => {
  const cases = [
    { currentPosition: 10.999999, targetIndex: 11, expectedStopAt: 11, expectedNormalizedIndex: 11 },
    { currentPosition: 11, targetIndex: 11, expectedStopAt: 11, expectedNormalizedIndex: 11 },
    { currentPosition: 11.000002, targetIndex: 12, expectedStopAt: 12, expectedNormalizedIndex: 12 },
    { currentPosition: 20.999999, targetIndex: 0, expectedStopAt: 21, expectedNormalizedIndex: 0 },
  ]

  for (const { currentPosition, targetIndex, expectedStopAt, expectedNormalizedIndex } of cases) {
    const stopAt = resolveStopPosition(currentPosition, targetIndex, STRIP_LENGTH)
    assertAlmostEqual(stopAt, expectedStopAt)
    assert.equal(normalizeStoppedPosition(stopAt), expectedNormalizedIndex)
  }
})

test('resolveStopPosition keeps boundary-aligned stops on phase even when minimum travel adds a full wrap', () => {
  const stopAt = resolveStopPosition(10.999999, 11, STRIP_LENGTH, 6)

  assertAlmostEqual(stopAt, 32)
  assert.equal(normalizeStoppedPosition(stopAt), 11)
  assert.ok(stopAt - 10.999999 >= 6)
})

test('stop resolution and stop animation endpoint stay aligned across integer and wrap boundaries', () => {
  const cases = [
    { currentPosition: 10.999999, expectedStopIndex: 11 },
    { currentPosition: 11, expectedStopIndex: 11 },
    { currentPosition: 11.000002, expectedStopIndex: 12 },
    { currentPosition: 20.999999, expectedStopIndex: 0 },
  ]

  for (const { currentPosition, expectedStopIndex } of cases) {
    const resolution = resolveStopIndex({
      reelIndex: 0,
      currentPosition,
      lockedCenterIndices: [null, null, null],
      bet: 1,
      pendingKind: 'MISS',
      bonusFlag: null,
    })

    assert.equal(resolution.stopIndex, expectedStopIndex)
    assert.equal(resolution.resolvedKind, 'MISS')

    const stopAt = resolveStopPosition(currentPosition, resolution.stopIndex, STRIP_LENGTH)
    assert.equal(normalizeStoppedPosition(stopAt), expectedStopIndex)
  }
})

test('advanceReelAnimation settles on stopAt without snapping to a different phase', () => {
  const reel = {
    position: 16.995,
    targetIndex: 11,
    stopAt: 17,
    isSpinning: true,
  }

  assert.deepEqual(advanceReelAnimation(reel, 1 / 60), {
    position: 17,
    targetIndex: 11,
    stopAt: null,
    isSpinning: false,
  })
})

test('advanceReelAnimation keeps wrapped stop endpoints consistent with final normalization', () => {
  const settled = advanceReelAnimation(
    {
      position: 20.995,
      targetIndex: 0,
      stopAt: 21,
      isSpinning: true,
    },
    1 / 60,
  )

  assert.deepEqual(settled, {
    position: 21,
    targetIndex: 0,
    stopAt: null,
    isSpinning: false,
  })
  assert.equal(normalizeStoppedPosition(settled.position), 0)
})
