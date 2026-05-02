export type LeverHitKind = 'BIG' | 'REG' | 'BELL' | 'PLUM' | 'REPLAY' | 'CHERRY' | 'MISS'

export const LEVER_LOTTERY_DENOMINATOR = 960

const LEVER_HIT_RANGES: Array<{
  upperExclusive: number
  kind: Exclude<LeverHitKind, 'MISS'>
}> = [
  { upperExclusive: 120, kind: 'REPLAY' },
  { upperExclusive: 195, kind: 'CHERRY' },
  { upperExclusive: 270, kind: 'PLUM' },
  { upperExclusive: 315, kind: 'BELL' },
  { upperExclusive: 319, kind: 'BIG' },
  { upperExclusive: 331, kind: 'REG' },
]

export function resolveLeverHitKind(drawIndex: number, hasBonusFlag: boolean): LeverHitKind {
  if (!Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex >= LEVER_LOTTERY_DENOMINATOR) {
    throw new RangeError(`drawIndex must be an integer between 0 and ${LEVER_LOTTERY_DENOMINATOR - 1}.`)
  }

  for (const entry of LEVER_HIT_RANGES) {
    if (drawIndex >= entry.upperExclusive) {
      continue
    }

    if (hasBonusFlag && (entry.kind === 'BIG' || entry.kind === 'REG')) {
      return 'MISS'
    }

    return entry.kind
  }

  return 'MISS'
}

export function rollLeverHitKind(hasBonusFlag: boolean, random: () => number = Math.random): LeverHitKind {
  return resolveLeverHitKind(Math.floor(random() * LEVER_LOTTERY_DENOMINATOR), hasBonusFlag)
}