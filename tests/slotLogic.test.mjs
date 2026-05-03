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
  resolveSpinControls,
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
  RED_7: 'BIG',
  BLUE_7: 'BIG',
  BAR: 'REG',
  BELL: 'BELL',
  MELON: 'MELON',
  REPLAY: 'REPLAY',
}

const PAYOUT_BY_KIND = {
  BIG: 711,
  REG: 104,
  BELL: 8,
  MELON: 15,
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

  return !visibleBoard[0].includes('CHERRY')
}

function collectVisibleKinds(visibleBoard, bet) {
  const kinds = []

  for (const paylineId of ACTIVE_PAYLINE_IDS_BY_BET[bet]) {
    const winningSymbol = uniformWinningSymbol(readTestPayline(visibleBoard, paylineId))
    if (winningSymbol) {
      kinds.push(KIND_BY_SYMBOL[winningSymbol])
    }
  }

  if (visibleBoard[0].includes('CHERRY')) {
    kinds.push('CHERRY')
  }

  return kinds
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

function findCenterIndicesForMixedBig(targetPaylineId, bet) {
  for (let reel0 = 0; reel0 < REEL_STRIPS[0].length; reel0 += 1) {
    for (let reel1 = 0; reel1 < REEL_STRIPS[1].length; reel1 += 1) {
      for (let reel2 = 0; reel2 < REEL_STRIPS[2].length; reel2 += 1) {
        const centerIndices = [reel0, reel1, reel2]
        const visibleBoard = visibleBoardFromCenterIndices(centerIndices)
        const lineSymbols = readTestPayline(visibleBoard, targetPaylineId)

        if (!lineSymbols.every((symbol) => symbol === 'RED_7' || symbol === 'BLUE_7')) {
          continue
        }

        if (lineSymbols.every((symbol) => symbol === lineSymbols[0])) {
          continue
        }

        if (collectVisibleKinds(visibleBoard, bet).length > 0) {
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

test('REEL_STRIPS keeps 21 symbols per reel and removes PLUM entirely', () => {
  for (const strip of REEL_STRIPS) {
    assert.equal(strip.length, 21)
    assert.equal(strip.includes('PLUM'), false)
  }
})

const ACTIVE_PAYLINE_CASES = [
  { paylineId: 'top', bet: 2 },
  { paylineId: 'center', bet: 1 },
  { paylineId: 'bottom', bet: 2 },
  { paylineId: 'diagonalDown', bet: 3 },
  { paylineId: 'diagonalUp', bet: 3 },
]

function findAnyActiveWin(targetSymbol) {
  for (const activeCase of ACTIVE_PAYLINE_CASES) {
    const candidate = findCenterIndicesForWin(activeCase.paylineId, targetSymbol, activeCase.bet)
    if (candidate) {
      return { ...candidate, ...activeCase }
    }
  }

  return null
}

for (const [symbol, expectedKind] of Object.entries(KIND_BY_SYMBOL)) {
  test(`${symbol} is evaluated as ${expectedKind} on at least one active payline`, () => {
    const candidate = findAnyActiveWin(symbol)

    assert.ok(candidate, `No board found for ${symbol} on an active payline`)

    const outcome = evaluateBoard(candidate.centerIndices, candidate.bet)

    assert.equal(outcome.kind, expectedKind)

    if (expectedKind === 'REPLAY') {
      assert.equal(outcome.payout, candidate.bet)
      return
    }

    assert.equal(outcome.payout, PAYOUT_BY_KIND[expectedKind])
  })
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

test('mixed RED_7 and BLUE_7 does not evaluate as BIG', () => {
  const candidate = findCenterIndicesForMixedBig('center', 1)

  assert.ok(candidate, 'No mixed BIG board found on the center payline at bet 1')
  assert.equal(evaluateBoard(candidate.centerIndices, 1).kind, 'MISS')
})

test('resolveSpinBet reuses the replay payout when the next game starts without a bet', () => {
  assert.equal(resolveSpinBet(0, { kind: 'REPLAY', payout: 3 }), 3)
  assert.equal(resolveSpinBet(2, { kind: 'REPLAY', payout: 3 }), 2)
  assert.equal(resolveSpinBet(0, { kind: 'MISS', payout: 0 }), 0)
})

test('resolveSpinControls keeps bet buttons locked while a replay game is ready', () => {
  assert.deepEqual(
    resolveSpinControls({
      bet: 0,
      credits: 50,
      isSpinning: false,
      lastOutcome: { kind: 'REPLAY', payout: 3 },
    }),
    {
      activePaylineBet: 3,
      canBetOne: false,
      canMaxBet: false,
      canLever: true,
      isReplayReady: true,
    },
  )

  assert.deepEqual(
    resolveSpinControls({
      bet: 0,
      credits: 50,
      isSpinning: false,
      lastOutcome: { kind: 'MISS', payout: 0 },
    }),
    {
      activePaylineBet: 0,
      canBetOne: true,
      canMaxBet: true,
      canLever: false,
      isReplayReady: false,
    },
  )
})

test('getReachableStopIndices wraps across the strip boundary', () => {
  assert.deepEqual(getReachableStopIndices(0, 19.2), [20, 0, 1, 2, 3])
})

test('resolveStopIndex keeps a clean first-stop BIG candidate in range', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 11.4,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 16)
  assert.equal(resolution.resolvedKind, 'BIG')
})

test('resolveStopIndex drops a later-stop BIG candidate when the current line cannot stay clean', () => {
  const resolution = resolveStopIndex({
    reelIndex: 1,
    currentPosition: 6.2,
    lockedCenterIndices: [14, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 7)
  assert.equal(resolution.resolvedKind, 'MISS')
})

test('resolveStopIndex can steer to a clean BIG bonus flag', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 11.4,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'MISS',
    bonusFlag: 'BIG',
  })

  assert.equal(resolution.stopIndex, 16)
  assert.equal(resolution.resolvedKind, 'BIG')
})

test('resolveStopIndex falls back to MISS when no clean BIG is reachable', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 0,
    lockedCenterIndices: [null, null, null],
    bet: 1,
    pendingKind: 'BIG',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 0)
  assert.equal(resolution.resolvedKind, 'MISS')
})

test('resolveStopIndex slides the left reel past CHERRY when that would make another BELL look duplicated', () => {
  const resolution = resolveStopIndex({
    reelIndex: 0,
    currentPosition: 2,
    lockedCenterIndices: [null, null, null],
    bet: 2,
    pendingKind: 'BELL',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 6)
  assert.equal(resolution.resolvedKind, 'BELL')
  assert.equal(visibleBoardFromCenterIndices([resolution.stopIndex, 0, 0])[0].includes('CHERRY'), false)
})

test('resolveStopIndex drops the final reel to MISS when the reachable BELL would also show another hit', () => {
  const dirtyBoard = visibleBoardFromCenterIndices([6, 5, 10])
  const dirtyKinds = collectVisibleKinds(dirtyBoard, 2)
  assert.ok(dirtyKinds.includes('BELL'))
  assert.ok(dirtyKinds.some((kind) => kind !== 'BELL'))

  const resolution = resolveStopIndex({
    reelIndex: 2,
    currentPosition: 7,
    lockedCenterIndices: [6, 5, null],
    bet: 2,
    pendingKind: 'BELL',
    bonusFlag: null,
  })

  assert.equal(resolution.stopIndex, 7)
  assert.equal(resolution.resolvedKind, 'MISS')
  assert.equal(evaluateBoard([6, 5, resolution.stopIndex], 2).kind, 'MISS')
})

test('resolveBonusFlag only clears after a bonus is actually aligned', () => {
  assert.equal(resolveBonusFlag('BIG', 'MISS'), 'BIG')
  assert.equal(resolveBonusFlag('REG', 'BELL'), 'REG')
  assert.equal(resolveBonusFlag('BIG', 'BIG'), null)
  assert.equal(resolveBonusFlag('REG', 'REG'), null)
})
