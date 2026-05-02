import assert from 'node:assert/strict'
import test from 'node:test'

const modulePath = process.env.SLOT_LOGIC_MODULE

if (!modulePath) {
  throw new Error('SLOT_LOGIC_MODULE is required.')
}

const {
  REEL_STRIPS,
  evaluateBoard,
  getReachableStopIndices,
  resolveBonusFlag,
  resolveSpinBet,
  resolveStopIndex,
  visibleBoardFromCenterIndices,
} = await import(modulePath)

const PAYLINE_ROW_OFFSETS = {
  top: [-1, -1, -1],
  center: [0, 0, 0],
  bottom: [1, 1, 1],
  diagonalDown: [-1, 0, 1],
  diagonalUp: [1, 0, -1],
}

const ACTIVE_PAYLINE_IDS_BY_BET = {
  1: ['center'],
  2: ['top', 'center', 'bottom'],
  3: ['top', 'center', 'bottom', 'diagonalDown', 'diagonalUp'],
}

const KIND_BY_SYMBOL = {
  '7': 'BIG',
  BAR: 'REG',
  BELL: 'BELL',
  PLUM: 'PLUM',
  MELON: 'MELON',
  REPLAY: 'REPLAY',
}

const PAYOUT_BY_KIND = {
  BIG: 711,
  REG: 104,
  BELL: 15,
  PLUM: 10,
  MELON: 8,
}

function readTestPayline(visibleBoard, paylineId) {
  return PAYLINE_ROW_OFFSETS[paylineId].map((rowOffset, reelIndex) => {
    return visibleBoard[reelIndex][rowOffset + 1]
  })
}

function uniformWinningSymbol(lineSymbols) {
  const [firstSymbol] = lineSymbols
  if (!lineSymbols.every((symbol) => symbol === firstSymbol)) {
    return null
  }

  return Object.hasOwn(KIND_BY_SYMBOL, firstSymbol) ? firstSymbol : null
}

function hasOnlyTargetWin(visibleBoard, bet, targetPaylineId, targetSymbol) {
  for (const paylineId of ACTIVE_PAYLINE_IDS_BY_BET[bet]) {
    const winningSymbol = uniformWinningSymbol(readTestPayline(visibleBoard, paylineId))

    if (!winningSymbol) {
      continue
    }

    if (paylineId === targetPaylineId && winningSymbol === targetSymbol) {
      continue
    }

    return false
  }

  if (targetSymbol === '7' || targetSymbol === 'BAR') {
    return true
  }

  return !visibleBoard[0].includes('CHERRY')
}

function findCenterIndicesForWin(targetPaylineId, targetSymbol, bet) {
  for (let reel0 = 0; reel0 < REEL_STRIPS[0].length; reel0 += 1) {
    for (let reel1 = 0; reel1 < REEL_STRIPS[1].length; reel1 += 1) {
      for (let reel2 = 0; reel2 < REEL_STRIPS[2].length; reel2 += 1) {
        const centerIndices = [reel0, reel1, reel2]
        const visibleBoard = visibleBoardFromCenterIndices(centerIndices)

        if (!readTestPayline(visibleBoard, targetPaylineId).every((symbol) => symbol === targetSymbol)) {
          continue
        }

        if (!hasOnlyTargetWin(visibleBoard, bet, targetPaylineId, targetSymbol)) {
          continue
        }

        return { centerIndices, visibleBoard }
      }
    }
  }

  return null
}

test('visibleBoardFromCenterIndices matches the reel display order for top and bottom rows', () => {
  const visibleBoard = visibleBoardFromCenterIndices([0, 0, 0])

  assert.equal(visibleBoard[0][0], REEL_STRIPS[0][1])
  assert.equal(visibleBoard[0][1], REEL_STRIPS[0][0])
  assert.equal(visibleBoard[0][2], REEL_STRIPS[0][REEL_STRIPS[0].length - 1])
})

const ACTIVE_PAYLINE_CASES = [
  { paylineId: 'top', bet: 2 },
  { paylineId: 'center', bet: 1 },
  { paylineId: 'bottom', bet: 2 },
  { paylineId: 'diagonalDown', bet: 3 },
  { paylineId: 'diagonalUp', bet: 3 },
]

for (const [symbol, expectedKind] of Object.entries(KIND_BY_SYMBOL)) {
  for (const { paylineId, bet } of ACTIVE_PAYLINE_CASES) {
    test(`${expectedKind} is evaluated on the ${paylineId} payline at bet ${bet}`, () => {
      const candidate = findCenterIndicesForWin(paylineId, symbol, bet)

      assert.ok(candidate, `No board found for ${expectedKind} on ${paylineId} at bet ${bet}`)

      const outcome = evaluateBoard(candidate.centerIndices, bet)

      assert.equal(outcome.kind, expectedKind)

      if (expectedKind === 'REPLAY') {
        assert.equal(outcome.payout, bet)
        return
      }

      assert.equal(outcome.payout, PAYOUT_BY_KIND[expectedKind])
    })
  }
}

const INACTIVE_PAYLINE_CASES = [
  { paylineId: 'top', activeBet: 2, inactiveBet: 1 },
  { paylineId: 'bottom', activeBet: 2, inactiveBet: 1 },
  { paylineId: 'diagonalDown', activeBet: 3, inactiveBet: 2 },
  { paylineId: 'diagonalUp', activeBet: 3, inactiveBet: 2 },
]

for (const { paylineId, activeBet, inactiveBet } of INACTIVE_PAYLINE_CASES) {
  test(`${paylineId} stays inactive until bet ${activeBet}`, () => {
    const candidate = findCenterIndicesForWin(paylineId, 'REPLAY', activeBet)

    assert.ok(candidate, `No replay board found for ${paylineId} at bet ${activeBet}`)

    const outcome = evaluateBoard(candidate.centerIndices, inactiveBet)

    assert.equal(outcome.kind, 'MISS')
    assert.equal(outcome.payout, 0)
  })
}

test('resolveSpinBet reuses the replay payout when the next game starts without a bet', () => {
  assert.equal(resolveSpinBet(0, { kind: 'REPLAY', payout: 3 }), 3)
  assert.equal(resolveSpinBet(2, { kind: 'REPLAY', payout: 3 }), 2)
  assert.equal(resolveSpinBet(0, { kind: 'MISS', payout: 0 }), 0)
})

test('getReachableStopIndices wraps across the strip boundary', () => {
  assert.deepEqual(getReachableStopIndices(0, 19.2), [20, 0, 1, 2, 3])
})

test('resolveStopIndex chooses the nearest matching symbol within four steps on the first stop', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 11.4,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 14)
  assert.equal(resolution.resolvedKind, 'BIG')
})

test('resolveStopIndex keeps a bonus line alive on a later stop', () => {
  const resolution = resolveStopIndex({
    reelIndex: 1,
    currentPosition: 6.2,
    lockedCenterIndices: [14, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 10)
  assert.equal(resolution.resolvedKind, 'BIG')
})

test('resolveStopIndex can steer to the active bonus flag while the lever result is MISS', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 11.4,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'MISS',
    bonusFlag: 'BIG',
  })

  assert.equal(resolution.stopIndex, 14)
  assert.equal(resolution.resolvedKind, 'BIG')
})

test('resolveStopIndex falls back to MISS when the pending symbol is out of the pull range', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 15.2,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 16)
  assert.equal(resolution.resolvedKind, 'MISS')
})

test('resolveBonusFlag only clears after a bonus is actually aligned', () => {
  assert.equal(resolveBonusFlag('BIG', 'MISS'), 'BIG')
  assert.equal(resolveBonusFlag('REG', 'PLUM'), 'REG')
  assert.equal(resolveBonusFlag('BIG', 'BIG'), null)
  assert.equal(resolveBonusFlag('REG', 'REG'), null)
})
