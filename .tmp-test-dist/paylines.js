export const PAYLINES = {
    top: { id: 'top', rowOffsets: [-1, -1, -1] },
    center: { id: 'center', rowOffsets: [0, 0, 0] },
    bottom: { id: 'bottom', rowOffsets: [1, 1, 1] },
    diagonalDown: { id: 'diagonalDown', rowOffsets: [-1, 0, 1] },
    diagonalUp: { id: 'diagonalUp', rowOffsets: [1, 0, -1] },
};
export const ALL_PAYLINES = [
    PAYLINES.top,
    PAYLINES.center,
    PAYLINES.bottom,
    PAYLINES.diagonalDown,
    PAYLINES.diagonalUp,
];
const ACTIVE_PAYLINE_IDS_BY_BET = {
    0: [],
    1: ['center'],
    2: ['top', 'center', 'bottom'],
    3: ['top', 'center', 'bottom', 'diagonalDown', 'diagonalUp'],
};
export function getActivePaylines(bet) {
    const paylineIds = ACTIVE_PAYLINE_IDS_BY_BET[normalizeBet(bet)];
    return paylineIds.map((paylineId) => PAYLINES[paylineId]);
}
function normalizeBet(bet) {
    switch (bet) {
        case 1:
        case 2:
        case 3:
            return bet;
        default:
            return 0;
    }
}
export function isHorizontalPayline(payline) {
    const [first, second, third] = payline.rowOffsets;
    return first === second && second === third;
}
export function readPayline(visibleBoard, payline) {
    return payline.rowOffsets.map((rowOffset, reelIndex) => {
        return visibleBoard[reelIndex][rowOffsetToIndex(rowOffset)];
    });
}
function rowOffsetToIndex(rowOffset) {
    switch (rowOffset) {
        case -1:
            return 0;
        case 0:
            return 1;
        case 1:
            return 2;
    }
}
