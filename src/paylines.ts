export type RowOffset = -1 | 0 | 1

export type PaylineId = 'top' | 'center' | 'bottom' | 'diagonalDown' | 'diagonalUp'

export interface PaylineDefinition {
  id: PaylineId
  rowOffsets: readonly [RowOffset, RowOffset, RowOffset]
}

export type VisibleBoard<T> = readonly [
  readonly [T, T, T],
  readonly [T, T, T],
  readonly [T, T, T],
]

export const PAYLINES = {
  top: { id: 'top', rowOffsets: [-1, -1, -1] as const },
  center: { id: 'center', rowOffsets: [0, 0, 0] as const },
  bottom: { id: 'bottom', rowOffsets: [1, 1, 1] as const },
  diagonalDown: { id: 'diagonalDown', rowOffsets: [-1, 0, 1] as const },
  diagonalUp: { id: 'diagonalUp', rowOffsets: [1, 0, -1] as const },
} satisfies Record<PaylineId, PaylineDefinition>

export const ALL_PAYLINES: readonly PaylineDefinition[] = [
  PAYLINES.top,
  PAYLINES.center,
  PAYLINES.bottom,
  PAYLINES.diagonalDown,
  PAYLINES.diagonalUp,
]

type SupportedBet = 0 | 1 | 2 | 3

const ACTIVE_PAYLINE_IDS_BY_BET: Record<SupportedBet, readonly PaylineId[]> = {
  0: [],
  1: ['center'],
  2: ['top', 'center', 'bottom'],
  3: ['top', 'center', 'bottom', 'diagonalDown', 'diagonalUp'],
}

export function getActivePaylines(bet: number): readonly PaylineDefinition[] {
  const paylineIds = ACTIVE_PAYLINE_IDS_BY_BET[normalizeBet(bet)]
  return paylineIds.map((paylineId) => PAYLINES[paylineId])
}

function normalizeBet(bet: number): SupportedBet {
  switch (bet) {
    case 1:
    case 2:
    case 3:
      return bet
    default:
      return 0
  }
}

export function isHorizontalPayline(payline: PaylineDefinition): boolean {
  const [first, second, third] = payline.rowOffsets
  return first === second && second === third
}

export function readPayline<T>(visibleBoard: VisibleBoard<T>, payline: PaylineDefinition): readonly [T, T, T] {
  return payline.rowOffsets.map((rowOffset, reelIndex) => {
    return visibleBoard[reelIndex][rowOffsetToIndex(rowOffset)]
  }) as [T, T, T]
}

function rowOffsetToIndex(rowOffset: RowOffset): 0 | 1 | 2 {
  switch (rowOffset) {
    case -1:
      return 0
    case 0:
      return 1
    case 1:
      return 2
  }
}