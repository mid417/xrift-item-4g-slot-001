export interface ReelAnimationState {
  position: number
  targetIndex: number
  stopAt: number | null
  isSpinning: boolean
}

const SPIN_SPEED = 18
const MIN_STOP_SPEED = 6
const STOP_EPSILON = 0.02
const STOP_SNAP_EPSILON = 0.01

export function advanceReelAnimation(reel: ReelAnimationState, delta: number): ReelAnimationState {
  if (!reel.isSpinning) {
    return reel
  }

  if (reel.stopAt === null) {
    return {
      ...reel,
      position: reel.position + delta * SPIN_SPEED,
    }
  }

  const remaining = reel.stopAt - reel.position
  const step = Math.min(remaining, delta * Math.max(MIN_STOP_SPEED, remaining * 8))
  const position = reel.position + step

  if (remaining <= STOP_EPSILON || position >= reel.stopAt - STOP_SNAP_EPSILON) {
    return {
      position: reel.targetIndex,
      targetIndex: reel.targetIndex,
      stopAt: null,
      isSpinning: false,
    }
  }

  return {
    ...reel,
    position,
  }
}
