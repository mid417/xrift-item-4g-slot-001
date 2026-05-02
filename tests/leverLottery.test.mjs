import assert from 'node:assert/strict'
import test from 'node:test'

const modulePath = process.env.LEVER_LOTTERY_MODULE

if (!modulePath) {
  throw new Error('LEVER_LOTTERY_MODULE is required.')
}

const { LEVER_LOTTERY_DENOMINATOR, resolveLeverHitKind, rollLeverHitKind } = await import(modulePath)

test('LEVER_LOTTERY_DENOMINATOR is 960', () => {
  assert.equal(LEVER_LOTTERY_DENOMINATOR, 960)
})

test('resolveLeverHitKind maps each lottery boundary to the expected hit kind', () => {
  assert.equal(resolveLeverHitKind(0, false), 'REPLAY')
  assert.equal(resolveLeverHitKind(119, false), 'REPLAY')
  assert.equal(resolveLeverHitKind(120, false), 'CHERRY')
  assert.equal(resolveLeverHitKind(194, false), 'CHERRY')
  assert.equal(resolveLeverHitKind(195, false), 'PLUM')
  assert.equal(resolveLeverHitKind(269, false), 'PLUM')
  assert.equal(resolveLeverHitKind(270, false), 'BELL')
  assert.equal(resolveLeverHitKind(314, false), 'BELL')
  assert.equal(resolveLeverHitKind(315, false), 'BIG')
  assert.equal(resolveLeverHitKind(318, false), 'BIG')
  assert.equal(resolveLeverHitKind(319, false), 'REG')
  assert.equal(resolveLeverHitKind(330, false), 'REG')
  assert.equal(resolveLeverHitKind(331, false), 'MISS')
  assert.equal(resolveLeverHitKind(959, false), 'MISS')
})

test('resolveLeverHitKind treats BIG and REG ranges as MISS while bonusFlag is active', () => {
  assert.equal(resolveLeverHitKind(314, true), 'BELL')
  assert.equal(resolveLeverHitKind(315, true), 'MISS')
  assert.equal(resolveLeverHitKind(318, true), 'MISS')
  assert.equal(resolveLeverHitKind(319, true), 'MISS')
  assert.equal(resolveLeverHitKind(330, true), 'MISS')
  assert.equal(resolveLeverHitKind(331, true), 'MISS')
})

test('rollLeverHitKind uses the same exact table with Math.random-compatible values', () => {
  assert.equal(rollLeverHitKind(false, () => 0), 'REPLAY')
  assert.equal(rollLeverHitKind(false, () => 315 / 960), 'BIG')
  assert.equal(rollLeverHitKind(true, () => 315 / 960), 'MISS')
  assert.equal(rollLeverHitKind(false, () => 319 / 960), 'REG')
  assert.equal(rollLeverHitKind(false, () => 331 / 960), 'MISS')
})