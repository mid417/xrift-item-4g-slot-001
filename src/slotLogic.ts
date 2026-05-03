import { getActivePaylines, readPayline } from './paylines'
import type { VisibleBoard } from './paylines'

import { REEL_STRIPS, REEL_SYMBOLS_PER_STRIP, type ReelSymbol } from './reelStrips'

export { REEL_STRIPS, REEL_SYMBOLS_PER_STRIP } from './reelStrips'
export type { ReelSymbol } from './reelStrips'

export type HitKind = 'BIG' | 'REG' | 'BELL' | 'MELON' | 'REPLAY' | 'CHERRY' | 'MISS'
export type BonusFlag = Extract<HitKind, 'BIG' | 'REG'>
type LineHitKind = Exclude<HitKind, 'CHERRY' | 'MISS'>

export interface Outcome {
  kind: HitKind
  payout: number
  title: string
  detail: string
  color: string
}

export type CenterIndices = [number, number, number]
export type PartialCenterIndices = [number | null, number | null, number | null]

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

export interface SpinControlInput {
  bet: number
  credits: number
  isSpinning: boolean
  lastOutcome: Pick<Outcome, 'kind' | 'payout'>
}

export interface SpinControlState {
  activePaylineBet: number
  canBetOne: boolean
  canMaxBet: boolean
  canLever: boolean
  isReplayReady: boolean
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

export function resolveSpinControls({
  bet,
  credits,
  isSpinning,
  lastOutcome,
}: SpinControlInput): SpinControlState {
  const activePaylineBet = resolveSpinBet(bet, lastOutcome)
  const isReplayReady = bet === 0 && lastOutcome.kind === 'REPLAY' && lastOutcome.payout > 0

  return {
    activePaylineBet,
    canBetOne: !isSpinning && !isReplayReady && bet < 3 && credits > bet,
    canMaxBet: !isSpinning && !isReplayReady && credits > 0,
    canLever: !isSpinning && activePaylineBet > 0,
    isReplayReady,
  }
}

export function evaluateBoard(centerIndices: CenterIndices, bet: number): Outcome {
  const visibleBoard = visibleBoardFromCenterIndices(centerIndices)

  for (const payline of getActivePaylines(bet)) {
    const lineSymbols = readPayline(visibleBoard, payline)
    const paylineKind = resolvePaylineKind(lineSymbols)
    if (paylineKind !== null) {
      return createOutcome(paylineKind, bet)
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

        if (isCleanOutcome([reel0, reel1, reel2], desiredKind, bet)) {
          return true
        }
      }
    }
  }

  return false
}

function createOutcome(kind: LineHitKind, bet: number): Outcome {
  switch (kind) {
    case 'BIG':
      return {
        kind,
        payout: 711,
        title: 'BIG BONUS',
        detail: 'BIG BONUS 711',
        color: '#fbbf24',
      }
    case 'REG':
      return {
        kind,
        payout: 104,
        title: 'REG BONUS',
        detail: 'REG BONUS 104',
        color: '#f472b6',
      }
    case 'BELL':
      return {
        kind,
        payout: 8,
        title: 'BELL',
        detail: 'BELL 8',
        color: '#fde047',
      }
    case 'MELON':
      return {
        kind,
        payout: 15,
        title: 'MELON',
        detail: 'MELON 15',
        color: '#6ee7b7',
      }
    case 'REPLAY':
      return createReplayOutcome(bet)
  }
}

function resolvePaylineKind(lineSymbols: readonly ReelSymbol[]): LineHitKind | null {
  if (!lineSymbols.every((symbol) => symbol === lineSymbols[0])) {
    return null
  }

  switch (lineSymbols[0]) {
    case 'RED_7':
    case 'BLUE_7':
      return 'BIG'
    case 'BAR':
      return 'REG'
    case 'BELL':
      return 'BELL'
    case 'MELON':
      return 'MELON'
    case 'REPLAY':
      return 'REPLAY'
    default:
      return null
  }
}

function collectVisibleKinds(centerIndices: CenterIndices, bet: number): HitKind[] {
  const visibleBoard = visibleBoardFromCenterIndices(centerIndices)
  const kinds: HitKind[] = []

  for (const payline of getActivePaylines(bet)) {
    const paylineKind = resolvePaylineKind(readPayline(visibleBoard, payline))
    if (paylineKind !== null) {
      kinds.push(paylineKind)
    }
  }

  if (visibleBoard[0].includes('CHERRY')) {
    kinds.push('CHERRY')
  }

  return kinds
}

function isCleanOutcome(centerIndices: CenterIndices, desiredKind: HitKind, bet: number): boolean {
  const visibleKinds = collectVisibleKinds(centerIndices, bet)

  if (desiredKind === 'MISS') {
    return visibleKinds.length === 0
  }

  return visibleKinds.includes(desiredKind) && visibleKinds.every((kind) => kind === desiredKind)
}
