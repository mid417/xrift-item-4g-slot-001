import { getActivePaylines, readPayline } from './paylines'
import type { VisibleBoard } from './paylines'

export type ReelSymbol = '7' | 'BAR' | 'BELL' | 'CHERRY' | 'REPLAY' | 'MELON' | 'PLUM'
export type HitKind = 'BIG' | 'REG' | 'BELL' | 'PLUM' | 'MELON' | 'REPLAY' | 'CHERRY' | 'MISS'
export type BonusFlag = Extract<HitKind, 'BIG' | 'REG'>

export interface Outcome {
  kind: HitKind
  payout: number
  title: string
  detail: string
  color: string
}

export type CenterIndices = [number, number, number]
export type PartialCenterIndices = [number | null, number | null, number | null]

export const REEL_SYMBOLS_PER_STRIP = 21

export const REEL_STRIPS = [
  [
    'BELL',
    'PLUM',
    '7',
    'CHERRY',
    'REPLAY',
    'MELON',
    'BELL',
    'PLUM',
    'BAR',
    'REPLAY',
    'BELL',
    'MELON',
    'PLUM',
    'CHERRY',
    '7',
    'BELL',
    'REPLAY',
    'BAR',
    'PLUM',
    'MELON',
    'BELL',
  ],
  [
    'PLUM',
    'BELL',
    'REPLAY',
    '7',
    'MELON',
    'BAR',
    'PLUM',
    'BELL',
    'REPLAY',
    'MELON',
    '7',
    'PLUM',
    'BELL',
    'BAR',
    'REPLAY',
    'MELON',
    'PLUM',
    'BELL',
    'BAR',
    'REPLAY',
    'PLUM',
  ],
  [
    'REPLAY',
    'BELL',
    'PLUM',
    'MELON',
    '7',
    'BAR',
    'REPLAY',
    'PLUM',
    'BELL',
    'MELON',
    'BAR',
    'PLUM',
    'REPLAY',
    'BELL',
    '7',
    'MELON',
    'PLUM',
    'BELL',
    'BAR',
    'REPLAY',
    'REPLAY',
  ],
] satisfies readonly [readonly ReelSymbol[], readonly ReelSymbol[], readonly ReelSymbol[]]

export const MISS_OUTCOME: Outcome = {
  kind: 'MISS',
  payout: 0,
  title: 'NO HIT',
  detail: 'NO HIT',
  color: '#b9b2a6',
}

const STOP_PULL_WINDOW = 4
const POSITION_EPSILON = 1e-6

REEL_STRIPS.forEach((strip, reelIndex) => {
  if (strip.length !== REEL_SYMBOLS_PER_STRIP) {
    throw new Error(`Reel ${reelIndex + 1} must have ${REEL_SYMBOLS_PER_STRIP} symbols.`)
  }
})

export interface StopResolutionInput {
  reelIndex: number
  currentPosition: number
  lockedCenterIndices: PartialCenterIndices
  bet: number
  pendingKind: HitKind
  bonusFlag: BonusFlag | null
}

export interface StopResolution {
  stopIndex: number
  resolvedKind: HitKind
}

export function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length
}

function symbolAt(strip: readonly ReelSymbol[], centerIndex: number, rowOffset: number): ReelSymbol {
  return strip[wrapIndex(centerIndex - rowOffset, strip.length)]
}

export function visibleBoardFromCenterIndices(centerIndices: CenterIndices): VisibleBoard<ReelSymbol> {
  return [
    [
      symbolAt(REEL_STRIPS[0], centerIndices[0], -1),
      symbolAt(REEL_STRIPS[0], centerIndices[0], 0),
      symbolAt(REEL_STRIPS[0], centerIndices[0], 1),
    ],
    [
      symbolAt(REEL_STRIPS[1], centerIndices[1], -1),
      symbolAt(REEL_STRIPS[1], centerIndices[1], 0),
      symbolAt(REEL_STRIPS[1], centerIndices[1], 1),
    ],
    [
      symbolAt(REEL_STRIPS[2], centerIndices[2], -1),
      symbolAt(REEL_STRIPS[2], centerIndices[2], 0),
      symbolAt(REEL_STRIPS[2], centerIndices[2], 1),
    ],
  ]
}

function createReplayOutcome(bet: number): Outcome {
  return {
    kind: 'REPLAY',
    payout: bet,
    title: 'REPLAY',
    detail: `REPLAY ${bet}`,
    color: '#67e8f9',
  }
}

export function resolveSpinBet(bet: number, lastOutcome: Pick<Outcome, 'kind' | 'payout'>): number {
  if (bet > 0) {
    return bet
  }

  return lastOutcome.kind === 'REPLAY' ? lastOutcome.payout : 0
}

export function evaluateBoard(centerIndices: CenterIndices, bet: number): Outcome {
  const visibleBoard = visibleBoardFromCenterIndices(centerIndices)

  for (const payline of getActivePaylines(bet)) {
    const lineSymbols = readPayline(visibleBoard, payline)

    if (lineSymbols.every((symbol) => symbol === '7')) {
      return {
        kind: 'BIG',
        payout: 711,
        title: 'BIG BONUS',
        detail: 'BIG BONUS 711',
        color: '#fbbf24',
      }
    }

    if (lineSymbols.every((symbol) => symbol === 'BAR')) {
      return {
        kind: 'REG',
        payout: 104,
        title: 'REG BONUS',
        detail: 'REG BONUS 104',
        color: '#f472b6',
      }
    }

    if (lineSymbols.every((symbol) => symbol === 'BELL')) {
      return {
        kind: 'BELL',
        payout: 15,
        title: 'BELL',
        detail: 'BELL 15',
        color: '#fde047',
      }
    }

    if (lineSymbols.every((symbol) => symbol === 'PLUM')) {
      return {
        kind: 'PLUM',
        payout: 10,
        title: 'PLUM',
        detail: 'PLUM 10',
        color: '#d8b4fe',
      }
    }

    if (lineSymbols.every((symbol) => symbol === 'MELON')) {
      return {
        kind: 'MELON',
        payout: 8,
        title: 'MELON',
        detail: 'MELON 8',
        color: '#6ee7b7',
      }
    }

    if (lineSymbols.every((symbol) => symbol === 'REPLAY')) {
      return createReplayOutcome(bet)
    }
  }

  const leftVisible = visibleBoard[0]
  if (leftVisible.includes('CHERRY')) {
    return {
      kind: 'CHERRY',
      payout: 2,
      title: 'CHERRY',
      detail: 'CHERRY 2',
      color: '#fb7185',
    }
  }

  return MISS_OUTCOME
}

export function getReachableStopIndices(reelIndex: number, currentPosition: number): number[] {
  const stripLength = REEL_STRIPS[reelIndex].length
  const firstReachableIndex = Math.ceil(currentPosition - POSITION_EPSILON)

  return Array.from({ length: STOP_PULL_WINDOW + 1 }, (_unused, step) => {
    return wrapIndex(firstReachableIndex + step, stripLength)
  })
}

export function resolveStopIndex({
  reelIndex,
  currentPosition,
  lockedCenterIndices,
  bet,
  pendingKind,
  bonusFlag,
}: StopResolutionInput): StopResolution {
  const reachableStopIndices = getReachableStopIndices(reelIndex, currentPosition)
  const desiredKinds = buildDesiredKinds(pendingKind, bonusFlag)

  for (const desiredKind of desiredKinds) {
    const matchingStopIndex = reachableStopIndices.find((stopIndex) => {
      const candidateIndices = replaceCenterIndex(lockedCenterIndices, reelIndex, stopIndex)
      return canResolveOutcome(candidateIndices, desiredKind, bet)
    })

    if (matchingStopIndex !== undefined) {
      return {
        stopIndex: matchingStopIndex,
        resolvedKind: desiredKind,
      }
    }
  }

  return {
    stopIndex: reachableStopIndices[0],
    resolvedKind: 'MISS',
  }
}

export function resolveBonusFlag(currentBonusFlag: BonusFlag | null, outcomeKind: HitKind): BonusFlag | null {
  if (outcomeKind === 'BIG' || outcomeKind === 'REG') {
    return null
  }

  return currentBonusFlag
}

function buildDesiredKinds(pendingKind: HitKind, bonusFlag: BonusFlag | null): HitKind[] {
  const desiredKinds: HitKind[] = []

  if (pendingKind !== 'MISS') {
    desiredKinds.push(pendingKind)
  }

  if (bonusFlag !== null && bonusFlag !== pendingKind) {
    desiredKinds.push(bonusFlag)
  }

  desiredKinds.push('MISS')

  return desiredKinds
}

function replaceCenterIndex(
  centerIndices: PartialCenterIndices,
  reelIndex: number,
  centerIndex: number,
): PartialCenterIndices {
  const nextCenterIndices = [...centerIndices] as PartialCenterIndices
  nextCenterIndices[reelIndex] = centerIndex
  return nextCenterIndices
}

function canResolveOutcome(centerIndices: PartialCenterIndices, desiredKind: HitKind, bet: number): boolean {
  for (let reel0 = 0; reel0 < REEL_STRIPS[0].length; reel0 += 1) {
    if (centerIndices[0] !== null && centerIndices[0] !== reel0) {
      continue
    }

    for (let reel1 = 0; reel1 < REEL_STRIPS[1].length; reel1 += 1) {
      if (centerIndices[1] !== null && centerIndices[1] !== reel1) {
        continue
      }

      for (let reel2 = 0; reel2 < REEL_STRIPS[2].length; reel2 += 1) {
        if (centerIndices[2] !== null && centerIndices[2] !== reel2) {
          continue
        }

        if (evaluateBoard([reel0, reel1, reel2], bet).kind === desiredKind) {
          return true
        }
      }
    }
  }

  return false
}
