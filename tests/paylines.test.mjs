import assert from 'node:assert/strict'
import test from 'node:test'

const modulePath = process.env.PAYLINES_MODULE

if (!modulePath) {
  throw new Error('PAYLINES_MODULE is required.')
}

const { ALL_PAYLINES, PAYLINES, getActivePaylines, readPayline } = await import(modulePath)

test('payline definitions are explicit per reel', () => {
  assert.equal(ALL_PAYLINES.length, 5)
  assert.deepEqual(PAYLINES.top.rowOffsets, [-1, -1, -1])
  assert.deepEqual(PAYLINES.center.rowOffsets, [0, 0, 0])
  assert.deepEqual(PAYLINES.bottom.rowOffsets, [1, 1, 1])
  assert.deepEqual(PAYLINES.diagonalDown.rowOffsets, [-1, 0, 1])
  assert.deepEqual(PAYLINES.diagonalUp.rowOffsets, [1, 0, -1])
})

test('active paylines match the ISSUE bet specification', () => {
  assert.deepEqual(getActivePaylines(0).map(({ id }) => id), [])
  assert.deepEqual(getActivePaylines(1).map(({ id }) => id), ['center'])
  assert.deepEqual(getActivePaylines(2).map(({ id }) => id), ['top', 'center', 'bottom'])
  assert.deepEqual(getActivePaylines(3).map(({ id }) => id), ['top', 'center', 'bottom', 'diagonalDown', 'diagonalUp'])
})

test('readPayline uses the same definition for straight and diagonal lines', () => {
  const visibleBoard = [
    ['L-TOP', 'L-CENTER', 'L-BOTTOM'],
    ['M-TOP', 'M-CENTER', 'M-BOTTOM'],
    ['R-TOP', 'R-CENTER', 'R-BOTTOM'],
  ]

  assert.deepEqual(readPayline(visibleBoard, PAYLINES.top), ['L-TOP', 'M-TOP', 'R-TOP'])
  assert.deepEqual(readPayline(visibleBoard, PAYLINES.center), ['L-CENTER', 'M-CENTER', 'R-CENTER'])
  assert.deepEqual(readPayline(visibleBoard, PAYLINES.bottom), ['L-BOTTOM', 'M-BOTTOM', 'R-BOTTOM'])
  assert.deepEqual(readPayline(visibleBoard, PAYLINES.diagonalDown), ['L-TOP', 'M-CENTER', 'R-BOTTOM'])
  assert.deepEqual(readPayline(visibleBoard, PAYLINES.diagonalUp), ['L-BOTTOM', 'M-CENTER', 'R-TOP'])
})