export interface ReelAnimationState {
  position: number
  targetIndex: number
  stopAt: number | null
  isSpinning: boolean
}

const REEL_ROTATION_STEPS = 21
export const SPIN_CYCLE_SECONDS = 0.9
export const SPIN_SPEED = REEL_ROTATION_STEPS / SPIN_CYCLE_SECONDS
const MIN_STOP_SPEED = 6
const STOP_EPSILON = 0.02
const STOP_SNAP_EPSILON = 0.01

function wrapDistance(current: number, target: number, length: number): number {
  return ((target - current) % length + length) % length
}

export function resolveStopPosition(
  currentPosition: number,
  targetIndex: number,
  stripLength: number,
  minimumTravel = 0,
): number {
  const stopAt = currentPosition + wrapDistance(currentPosition, targetIndex, stripLength)
  const remainingMinimumTravel = Math.max(0, minimumTravel) - (stopAt - currentPosition)

  if (remainingMinimumTravel <= 0) {
    return stopAt
  }

  return stopAt + Math.ceil(remainingMinimumTravel / stripLength) * stripLength
}

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
      ...reel,
      position: reel.stopAt,
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
