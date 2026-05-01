import { useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { DoubleSide, Shape } from 'three'

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const ITEM_MODEL_SCALE = 1 / 5
const ITEM_BASE_Y_SCALE_COMPENSATION = 1 / ITEM_MODEL_SCALE
const PEDESTAL_HEIGHT = 4.8

type ReelSymbol = '7' | 'BAR' | 'BELL' | 'CHERRY' | 'REPLAY' | 'MELON' | 'PLUM'
type HitKind = 'BIG' | 'REG' | 'BELL' | 'PLUM' | 'MELON' | 'REPLAY' | 'CHERRY' | 'MISS'

interface ReelState {
  position: number
  targetIndex: number
  stopAt: number | null
  isSpinning: boolean
}

interface Outcome {
  kind: HitKind
  payout: number
  title: string
  detail: string
  color: string
}

interface ControlButtonProps {
  label: string
  position: [number, number, number]
  color: string
  enabled: boolean
  onPress: () => void
  size?: [number, number, number]
}

const WINDOW_CENTER_Y = 2.7
const REEL_X_POSITIONS = [-0.82, 0, 0.82] as const
const START_CREDITS = 50
const REEL_SYMBOLS_PER_STRIP = 21
const REEL_SYMBOL_ANGLE = (Math.PI * 2) / REEL_SYMBOLS_PER_STRIP
const REEL_RADIUS = 0.91
const ROW_HEIGHT = 2 * REEL_RADIUS * Math.sin(REEL_SYMBOL_ANGLE / 2)
const REEL_CARD_WIDTH = 0.54
const REEL_CARD_HEIGHT = REEL_RADIUS * REEL_SYMBOL_ANGLE * 0.96
const REEL_CARD_DEPTH = 0.03
const REEL_CORE_RADIUS = REEL_RADIUS - REEL_CARD_DEPTH * 1.8
const REEL_DRUM_CENTER_Z = 0.14
const REEL_GLASS_Z = 1.08
const REEL_PANEL_Z = 1.11
const CABINET_BODY_DEPTH = 1.7
const CABINET_BODY_FRONT_Z = CABINET_BODY_DEPTH / 2
const REEL_PANEL_SHROUD_BACK_Z = CABINET_BODY_FRONT_Z + 0.01
const REEL_PANEL_SHROUD_DEPTH = REEL_PANEL_Z - REEL_PANEL_SHROUD_BACK_Z
const REEL_WINDOW_WIDTH = 0.62
const REEL_WINDOW_HEIGHT = ROW_HEIGHT * (11 / 3)
const REEL_PANEL_WIDTH = 2.92
const REEL_PANEL_HEIGHT = REEL_WINDOW_HEIGHT + 0.24
const REEL_HOLE_RADIUS = 0.08
const REEL_CLICK_Z = REEL_PANEL_Z + 0.04
const REEL_BEZEL_WIDTH = REEL_WINDOW_WIDTH + 0.08
const REEL_BEZEL_HEIGHT = REEL_WINDOW_HEIGHT + 0.08
const REEL_BEZEL_DEPTH = 0.02
const REEL_BEZEL_BORDER = 0.04
const MISS_OUTCOME: Outcome = {
  kind: 'MISS',
  payout: 0,
  title: 'NO HIT',
  detail: 'NO HIT',
  color: '#b9b2a6',
}

const ACTIVE_LINE_ROWS: Record<number, number[]> = {
  0: [],
  1: [0],
  2: [0, -1],
  3: [-1, 0, 1],
}

const SYMBOL_LABELS: Record<ReelSymbol, string> = {
  '7': '7',
  BAR: 'BAR',
  BELL: 'BELL',
  CHERRY: 'CHRY',
  REPLAY: 'RPLY',
  MELON: 'MLON',
  PLUM: 'PLUM',
}

const SYMBOL_COLORS: Record<ReelSymbol, string> = {
  '7': '#ef4444',
  BAR: '#111827',
  BELL: '#facc15',
  CHERRY: '#fb7185',
  REPLAY: '#60a5fa',
  MELON: '#34d399',
  PLUM: '#c084fc',
}

const REEL_STRIPS: ReelSymbol[][] = [
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
]

REEL_STRIPS.forEach((strip, reelIndex) => {
  if (strip.length !== REEL_SYMBOLS_PER_STRIP) {
    throw new Error(`Reel ${reelIndex + 1} must have ${REEL_SYMBOLS_PER_STRIP} symbols.`)
  }
})

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length
}

function wrapDistance(current: number, target: number, length: number): number {
  return ((target - current) % length + length) % length
}

function pickOne<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]
}

function symbolAt(strip: ReelSymbol[], centerIndex: number, rowOffset: number): ReelSymbol {
  return strip[wrapIndex(centerIndex + rowOffset, strip.length)]
}

function lineY(rowOffset: number): number {
  return WINDOW_CENTER_Y - rowOffset * ROW_HEIGHT
}

function traceRoundedRect(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  shape.closePath()
}

function createRoundedRectShape(x: number, y: number, width: number, height: number, radius: number): Shape {
  const shape = new Shape()
  traceRoundedRect(shape, x, y, width, height, radius)
  return shape
}

const FRONT_PANEL_SHAPE = (() => {
  const shape = createRoundedRectShape(
    -REEL_PANEL_WIDTH / 2,
    -REEL_PANEL_HEIGHT / 2,
    REEL_PANEL_WIDTH,
    REEL_PANEL_HEIGHT,
    0.16,
  )

  REEL_X_POSITIONS.forEach((reelX) => {
    shape.holes.push(
      createRoundedRectShape(
        reelX - REEL_WINDOW_WIDTH / 2,
        -REEL_WINDOW_HEIGHT / 2,
        REEL_WINDOW_WIDTH,
        REEL_WINDOW_HEIGHT,
        REEL_HOLE_RADIUS,
      ),
    )
  })

  return shape
})()

function createInitialReels(): ReelState[] {
  return REEL_STRIPS.map((strip) => ({
    position: Math.floor(Math.random() * strip.length),
    targetIndex: 0,
    stopAt: null,
    isSpinning: false,
  }))
}

function chooseSymbolIndex(reelIndex: number, symbol: ReelSymbol): number {
  const strip = REEL_STRIPS[reelIndex]
  const candidates = strip.flatMap((entry, index) => (entry === symbol ? [index] : []))
  return pickOne(candidates)
}

function buildLineTarget(symbol: ReelSymbol, rowOffset: number): [number, number, number] {
  return REEL_STRIPS.map((_strip, reelIndex) => {
    const centerIndex = chooseSymbolIndex(reelIndex, symbol) - rowOffset
    return wrapIndex(centerIndex, REEL_STRIPS[reelIndex].length)
  }) as [number, number, number]
}

function buildRandomTarget(): [number, number, number] {
  return REEL_STRIPS.map((strip) => Math.floor(Math.random() * strip.length)) as [number, number, number]
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

function evaluateBoard(centerIndices: [number, number, number], bet: number): Outcome {
  const activeRows = ACTIVE_LINE_ROWS[bet]

  for (const rowOffset of activeRows) {
    const lineSymbols = REEL_STRIPS.map((strip, reelIndex) => {
      return symbolAt(strip, centerIndices[reelIndex], rowOffset)
    }) as [ReelSymbol, ReelSymbol, ReelSymbol]

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

  const leftVisible = [-1, 0, 1].map((rowOffset) => symbolAt(REEL_STRIPS[0], centerIndices[0], rowOffset))
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

function buildMissTarget(bet: number): [number, number, number] {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = buildRandomTarget()
    if (evaluateBoard(candidate, bet).kind === 'MISS') {
      return candidate
    }
  }

  return [0, 4, 8]
}

function buildCherryTarget(bet: number): [number, number, number] {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate: [number, number, number] = [
      chooseSymbolIndex(0, 'CHERRY'),
      Math.floor(Math.random() * REEL_STRIPS[1].length),
      Math.floor(Math.random() * REEL_STRIPS[2].length),
    ]

    if (evaluateBoard(candidate, bet).kind === 'CHERRY') {
      return candidate
    }
  }

  return [chooseSymbolIndex(0, 'CHERRY'), 3, 9]
}

function buildTargetForResult(kind: HitKind, bet: number): [number, number, number] {
  const rowOffset = pickOne(ACTIVE_LINE_ROWS[bet])

  switch (kind) {
    case 'BIG':
      return buildLineTarget('7', rowOffset)
    case 'REG':
      return buildLineTarget('BAR', rowOffset)
    case 'BELL':
      return buildLineTarget('BELL', rowOffset)
    case 'PLUM':
      return buildLineTarget('PLUM', rowOffset)
    case 'MELON':
      return buildLineTarget('MELON', rowOffset)
    case 'REPLAY':
      return buildLineTarget('REPLAY', rowOffset)
    case 'CHERRY':
      return buildCherryTarget(bet)
    default:
      return buildMissTarget(bet)
  }
}

function rollHitKind(): HitKind {
  const roll = Math.random()

  if (roll < 0.0018) {
    return 'BIG'
  }

  if (roll < 0.0033) {
    return 'REG'
  }

  if (roll < 0.0433) {
    return 'BELL'
  }

  if (roll < 0.0633) {
    return 'PLUM'
  }

  if (roll < 0.0713) {
    return 'MELON'
  }

  if (roll < 0.1813) {
    return 'REPLAY'
  }

  if (roll < 0.2213) {
    return 'CHERRY'
  }

  return 'MISS'
}

function ControlButton({
  label,
  position,
  color,
  enabled,
  onPress,
  size = [0.58, 0.18, 0.34],
}: ControlButtonProps) {
  const [hovered, setHovered] = useState(false)
  const faceColor = enabled ? color : '#5a4a45'
  const glowColor = enabled ? color : '#241716'

  return (
    <group position={position}>
      <mesh position={[0, -0.01, -0.03]} receiveShadow>
        <boxGeometry args={[size[0] + 0.1, size[1] + 0.1, 0.08]} />
        <meshStandardMaterial color="#120d10" metalness={0.65} roughness={0.36} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        onClick={enabled ? onPress : undefined}
        onPointerOut={() => setHovered(false)}
        onPointerOver={enabled ? () => setHovered(true) : undefined}
        scale={enabled ? 1 : 0.96}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={faceColor}
          emissive={glowColor}
          emissiveIntensity={enabled ? (hovered ? 0.95 : 0.45) : 0.16}
          metalness={0.6}
          roughness={0.22}
        />
      </mesh>
      <mesh position={[0, size[1] * 0.22, size[2] / 2 + 0.005]}>
        <boxGeometry args={[size[0] * 0.8, size[1] * 0.18, 0.01]} />
        <meshStandardMaterial
          color={enabled ? '#fff6bf' : '#73645d'}
          emissive={enabled ? '#fff6bf' : '#2b2220'}
          emissiveIntensity={enabled ? 0.7 : 0.12}
          metalness={0.15}
          roughness={0.24}
        />
      </mesh>
      <Text
        anchorX="center"
        anchorY="middle"
        color={enabled ? '#fff8eb' : '#d2c2b5'}
        fontSize={0.095}
        position={[0, -0.005, size[2] / 2 + 0.02]}
      >
        {label}
      </Text>
    </group>
  )
}


interface ReelSymbolCardProps {
  symbol: ReelSymbol
}

function ReelSymbolCard({ symbol }: ReelSymbolCardProps) {
  const label = SYMBOL_LABELS[symbol]
  const faceColor = symbol === 'BAR' ? '#111827' : SYMBOL_COLORS[symbol]
  const textColor = symbol === 'BAR' ? '#fff8ea' : '#111111'
  const outlineColor = symbol === 'BAR' ? '#241718' : '#fff8ea'
  const fontSize = symbol === '7' ? 0.21 : symbol.length > 4 ? 0.135 : 0.16

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[REEL_CARD_WIDTH, REEL_CARD_HEIGHT, REEL_CARD_DEPTH]} />
        <meshBasicMaterial color="#fffaf0" />
      </mesh>
      <mesh position={[0, 0, REEL_CARD_DEPTH / 2 + 0.006]}>
        <planeGeometry args={[REEL_CARD_WIDTH * 0.8, REEL_CARD_HEIGHT * 0.74]} />
        <meshBasicMaterial color={faceColor} side={DoubleSide} />
      </mesh>
      <Text
        anchorX="center"
        anchorY="middle"
        color={textColor}
        fontSize={fontSize}
        maxWidth={REEL_CARD_WIDTH * 0.74}
        outlineColor={outlineColor}
        outlineWidth={0.008}
        position={[0, 0, REEL_CARD_DEPTH / 2 + 0.05]}
      >
        {label}
      </Text>
      <Text
        anchorX="center"
        anchorY="middle"
        color={textColor}
        fontSize={fontSize}
        maxWidth={REEL_CARD_WIDTH * 0.74}
        outlineColor={outlineColor}
        outlineWidth={0.008}
        position={[0, 0, -(REEL_CARD_DEPTH / 2 + 0.05)]}
        rotation={[0, Math.PI, 0]}
      >
        {label}
      </Text>
    </group>
  )
}

interface ReelDrumProps {
  reelIndex: number
  reelX: number
  reel: ReelState
  stopEnabled: boolean
  onStop: (reelIndex: number) => void
}

function ReelDrum({ reelIndex, reelX, reel, stopEnabled, onStop }: ReelDrumProps) {
  const strip = REEL_STRIPS[reelIndex]
  const bezelZ = REEL_PANEL_Z - REEL_BEZEL_DEPTH / 2

  return (
    <group position={[reelX, WINDOW_CENTER_Y, 0]}>
      {[
        { key: 'top', position: [0, (REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER) / 2, bezelZ], size: [REEL_BEZEL_WIDTH, REEL_BEZEL_BORDER, REEL_BEZEL_DEPTH] },
        { key: 'bottom', position: [0, -(REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER) / 2, bezelZ], size: [REEL_BEZEL_WIDTH, REEL_BEZEL_BORDER, REEL_BEZEL_DEPTH] },
        {
          key: 'left',
          position: [-(REEL_BEZEL_WIDTH - REEL_BEZEL_BORDER) / 2, 0, bezelZ],
          size: [REEL_BEZEL_BORDER, REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER * 2, REEL_BEZEL_DEPTH],
        },
        {
          key: 'right',
          position: [(REEL_BEZEL_WIDTH - REEL_BEZEL_BORDER) / 2, 0, bezelZ],
          size: [REEL_BEZEL_BORDER, REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER * 2, REEL_BEZEL_DEPTH],
        },
      ].map((bezel) => (
        <mesh key={bezel.key} position={bezel.position as [number, number, number]}>
          <boxGeometry args={bezel.size as [number, number, number]} />
          <meshStandardMaterial color="#1a1315" emissive="#080608" emissiveIntensity={0.12} metalness={0.42} roughness={0.38} />
        </mesh>
      ))}
      <group position={[0, 0, REEL_DRUM_CENTER_Z]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[REEL_CORE_RADIUS, REEL_CORE_RADIUS, REEL_CARD_WIDTH * 0.96, 32, 1, true]} />
          <meshStandardMaterial color="#cabf9e" emissive="#84755d" emissiveIntensity={0.12} metalness={0.2} roughness={0.52} />
        </mesh>
        {strip.map((symbol, symbolIndex) => {
          const angle = (symbolIndex - reel.position) * REEL_SYMBOL_ANGLE

          return (
            <group
              key={`${reelIndex}-${symbolIndex}`}
              position={[0, Math.sin(angle) * REEL_RADIUS, Math.cos(angle) * REEL_RADIUS]}
              rotation={[-angle, 0, 0]}
            >
              <ReelSymbolCard symbol={symbol} />
            </group>
          )
        })}
      </group>
      <mesh position={[0, 0, REEL_GLASS_Z]}>
        <boxGeometry args={[REEL_WINDOW_WIDTH - 0.04, REEL_WINDOW_HEIGHT - 0.04, 0.02]} />
        <meshStandardMaterial
          color={stopEnabled ? '#fff1f6' : '#ddf4ff'}
          emissive={stopEnabled ? '#fb7185' : '#ddf4ff'}
          emissiveIntensity={stopEnabled ? 0.22 : 0.12}
          transparent
          opacity={stopEnabled ? 0.18 : 0.1}
          metalness={0.08}
          roughness={0.08}
        />
      </mesh>
      <mesh onClick={stopEnabled ? () => onStop(reelIndex) : undefined} position={[0, 0, REEL_CLICK_Z]}>
        <boxGeometry args={[REEL_WINDOW_WIDTH + 0.06, REEL_WINDOW_HEIGHT + 0.06, 0.08]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

export const Item = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => {
  const spinBetRef = useRef(0)
  const [reels, setReels] = useState<ReelState[]>(() => createInitialReels())
  const [credits, setCredits] = useState(START_CREDITS)
  const [bet, setBet] = useState(0)
  const [message, setMessage] = useState('INSERT MEDAL')
  const [lastOutcome, setLastOutcome] = useState<Outcome>(MISS_OUTCOME)
  const isSpinning = reels.some((reel) => reel.isSpinning)
  const activeRows = ACTIVE_LINE_ROWS[bet]

  const insertMedal = () => {
    if (isSpinning) {
      return
    }

    setCredits((current) => Math.min(99, current + 10))
    setMessage('MEDAL +10')
  }

  const betOne = () => {
    if (isSpinning) {
      return
    }

    if (bet >= 3) {
      setMessage('MAX BET')
      return
    }

    if (credits <= bet) {
      setMessage('OUT OF MEDALS')
      return
    }

    const nextBet = bet + 1
    setBet(nextBet)
    setMessage(`BET ${nextBet}`)
  }

  const maxBet = () => {
    if (isSpinning) {
      return
    }

    const nextBet = Math.min(3, credits)
    if (nextBet === 0) {
      setMessage('INSERT MEDAL')
      return
    }

    setBet(nextBet)
    setMessage(`MAX BET ${nextBet}`)
  }

  const startSpin = () => {
    if (isSpinning) {
      return
    }

    if (bet === 0) {
      setMessage('BET 1-3')
      return
    }

    const resultKind = rollHitKind()
    const targets = buildTargetForResult(resultKind, bet)

    spinBetRef.current = bet
    setCredits((current) => current - bet)
    setBet(0)
    setLastOutcome(MISS_OUTCOME)
    setMessage('LEVER ON / TOUCH WINDOWS')
    setReels((current) => {
      return current.map((reel, reelIndex) => ({
        position: reel.position,
        targetIndex: targets[reelIndex],
        stopAt: null,
        isSpinning: true,
      }))
    })
  }

  const stopReel = (reelIndex: number) => {
    if (!isSpinning) {
      return
    }

    setReels((current) => {
      return current.map((reel, index) => {
        if (index !== reelIndex || !reel.isSpinning || reel.stopAt !== null) {
          return reel
        }

        const stripLength = REEL_STRIPS[index].length
        const extraTravel = 6 + index * 1.4
        return {
          ...reel,
          stopAt: reel.position + extraTravel + wrapDistance(reel.position, reel.targetIndex, stripLength),
        }
      })
    })

    setMessage(`STOP ${reelIndex + 1}`)
  }

  const canStopReel = (reelIndex: number) => {
    return reels[reelIndex].isSpinning && reels[reelIndex].stopAt === null
  }

  useFrame((_state, delta) => {
    if (!isSpinning) {
      return
    }

    let finishedIndices: [number, number, number] | null = null

    setReels((current) => {
      const next = current.map((reel) => {
        if (!reel.isSpinning) {
          return reel
        }

        if (reel.stopAt === null) {
          return {
            ...reel,
            position: reel.position + delta * 18,
          }
        }

        const remaining = reel.stopAt - reel.position
        const step = Math.min(remaining, delta * Math.max(6, remaining * 8))
        const positionNow = reel.position + step

        if (remaining <= 0.02 || positionNow >= reel.stopAt - 0.01) {
          return {
            position: reel.targetIndex,
            targetIndex: reel.targetIndex,
            stopAt: null,
            isSpinning: false,
          }
        }

        return {
          ...reel,
          position: positionNow,
        }
      })

      const allStopped = next.every((reel) => !reel.isSpinning)
      if (allStopped) {
        finishedIndices = next.map((reel, reelIndex) => {
          return wrapIndex(Math.round(reel.position), REEL_STRIPS[reelIndex].length)
        }) as [number, number, number]

        return next.map((reel, reelIndex) => ({
          ...reel,
          position: finishedIndices![reelIndex],
          stopAt: null,
          isSpinning: false,
        }))
      }

      return next
    })

    if (finishedIndices) {
      const outcome = evaluateBoard(finishedIndices, spinBetRef.current)
      const returnedCredits = outcome.payout

      setCredits((current) => Math.min(999, current + returnedCredits))
      setLastOutcome(outcome)
      setMessage(outcome.detail)
      spinBetRef.current = 0
    }
  })

  return (
    <group position={position} scale={scale * ITEM_MODEL_SCALE}>
      <RigidBody type="fixed" colliders="cuboid">
        <group position={[0, PEDESTAL_HEIGHT, 0]}>
          <group scale={[1, ITEM_BASE_Y_SCALE_COMPENSATION, 1]}>
            <mesh castShadow receiveShadow position={[0, -PEDESTAL_HEIGHT / 2, 0]}>
              <boxGeometry args={[5, PEDESTAL_HEIGHT, 2.7]} />
              <meshStandardMaterial color="#201818" metalness={0.28} roughness={0.72} />
            </mesh>
          </group>

          <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
            <boxGeometry args={[4.4, 5, CABINET_BODY_DEPTH]} />
            <meshStandardMaterial color="#171215" metalness={0.68} roughness={0.34} />
          </mesh>

          <mesh castShadow position={[0, 4.55, 1.08]}>
            <boxGeometry args={[3.72, 0.96, 0.18]} />
            <meshStandardMaterial color="#621d1d" emissive="#2d0d0b" emissiveIntensity={0.4} metalness={0.45} roughness={0.28} />
          </mesh>
          <mesh castShadow position={[0, 4.55, 1.16]}>
            <boxGeometry args={[3.4, 0.68, 0.06]} />
            <meshStandardMaterial
              color="#4f463f"
              emissive={lastOutcome.kind === 'MISS' ? '#16110f' : lastOutcome.color}
              emissiveIntensity={isSpinning ? 0.78 : lastOutcome.kind === 'MISS' ? 0.15 : 0.42}
              metalness={0.25}
              roughness={0.18}
            />
          </mesh>
          <mesh position={[0, 4.18, 1.2]}>
            <boxGeometry args={[2.9, 0.06, 0.03]} />
            <meshStandardMaterial color="#d4af37" emissive="#d4af37" emissiveIntensity={0.5} metalness={0.55} roughness={0.24} />
          </mesh>
          <Text anchorX="center" anchorY="middle" color="#fff0c2" fontSize={0.24} position={[0, 4.57, 1.2]}>
            4G SLOT
          </Text>
          <Text anchorX="center" anchorY="middle" color="#f8d77b" fontSize={0.07} position={[0, 4.28, 1.22]}>
            MEDAL MACHINE
          </Text>

          <mesh position={[0, 3.82, 1.08]}>
            <boxGeometry args={[3.06, 0.54, 0.12]} />
            <meshStandardMaterial color="#231417" emissive="#13090b" emissiveIntensity={0.25} metalness={0.42} roughness={0.3} />
          </mesh>

          {[
            { label: 'BIG', x: -1.08, active: lastOutcome.kind === 'BIG', color: '#fbbf24' },
            { label: 'REG', x: 0, active: lastOutcome.kind === 'REG', color: '#f472b6' },
            { label: 'SPIN', x: 1.08, active: isSpinning, color: '#67e8f9' },
          ].map((lamp) => (
            <group key={lamp.label} position={[lamp.x, 3.9, 1.14]}>
              <mesh>
                <sphereGeometry args={[0.14, 20, 20]} />
                <meshStandardMaterial
                  color={lamp.active ? lamp.color : '#4a3c38'}
                  emissive={lamp.active ? lamp.color : '#140f10'}
                  emissiveIntensity={lamp.active ? 1.1 : 0.05}
                  metalness={0.2}
                  roughness={0.18}
                />
              </mesh>
              <mesh position={[0, -0.18, -0.03]}>
                <boxGeometry args={[0.44, 0.08, 0.05]} />
                <meshStandardMaterial color={lamp.active ? lamp.color : '#49363a'} emissive={lamp.active ? lamp.color : '#1a1113'} emissiveIntensity={lamp.active ? 0.45 : 0.08} metalness={0.22} roughness={0.25} />
              </mesh>
              <Text anchorX="center" anchorY="middle" color="#f9ead5" fontSize={0.075} position={[0, -0.3, 0.06]}>
                {lamp.label}
              </Text>
            </group>
          ))}

          <mesh position={[0, WINDOW_CENTER_Y, 0.92]} receiveShadow>
            <boxGeometry args={[2.72, REEL_PANEL_HEIGHT + 0.28, 0.08]} />
            <meshStandardMaterial color="#14171d" emissive="#0f1720" emissiveIntensity={0.3} metalness={0.45} roughness={0.22} />
          </mesh>
          <mesh castShadow position={[0, WINDOW_CENTER_Y, REEL_PANEL_SHROUD_BACK_Z]} receiveShadow>
            <extrudeGeometry args={[FRONT_PANEL_SHAPE, { depth: REEL_PANEL_SHROUD_DEPTH, bevelEnabled: false }]} />
            <meshStandardMaterial color="#69615f" emissive="#1f1717" emissiveIntensity={0.18} metalness={0.75} roughness={0.18} />
          </mesh>

          {[-1, 0, 1].map((rowOffset) => {
            const active = activeRows.includes(rowOffset)
            return (
              <mesh key={rowOffset} position={[0, lineY(rowOffset), 1.19]}>
                <boxGeometry args={[2.56, 0.03, 0.03]} />
                <meshStandardMaterial
                  color={active ? '#fb7185' : '#35252b'}
                  emissive={active ? '#fb7185' : '#000000'}
                  emissiveIntensity={active ? 1.2 : 0}
                  transparent
                  opacity={active ? 0.85 : 0.45}
                />
              </mesh>
            )
          })}

          {REEL_X_POSITIONS.map((reelX, reelIndex) => {
            const stopEnabled = canStopReel(reelIndex)

            return <ReelDrum key={reelIndex} onStop={stopReel} reel={reels[reelIndex]} reelIndex={reelIndex} reelX={reelX} stopEnabled={stopEnabled} />
          })}

          <mesh position={[-1.67, 3.02, 1.08]}>
            <boxGeometry args={[0.78, 0.88, 0.1]} />
            <meshStandardMaterial color="#161215" emissive="#09070a" emissiveIntensity={0.18} metalness={0.42} roughness={0.24} />
          </mesh>
          <mesh position={[1.67, 3.02, 1.08]}>
            <boxGeometry args={[0.78, 0.88, 0.1]} />
            <meshStandardMaterial color="#161215" emissive="#09070a" emissiveIntensity={0.18} metalness={0.42} roughness={0.24} />
          </mesh>
          <mesh position={[-1.67, 1.84, 1.08]}>
            <boxGeometry args={[0.84, 1.32, 0.1]} />
            <meshStandardMaterial color="#171316" emissive="#09070a" emissiveIntensity={0.2} metalness={0.4} roughness={0.24} />
          </mesh>

          <mesh castShadow receiveShadow position={[0, 1.15, 1.02]}>
            <boxGeometry args={[3.7, 1.3, 0.14]} />
            <meshStandardMaterial color="#392322" emissive="#180c0b" emissiveIntensity={0.22} metalness={0.55} roughness={0.28} />
          </mesh>
          <mesh position={[0, 1.74, 1.04]} receiveShadow>
            <boxGeometry args={[1.88, 0.24, 0.08]} />
            <meshStandardMaterial color="#171215" emissive="#09070a" emissiveIntensity={0.16} metalness={0.46} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0.28, 1.01]} receiveShadow>
            <boxGeometry args={[3.12, 0.48, 0.12]} />
            <meshStandardMaterial color="#181318" emissive="#09070a" emissiveIntensity={0.16} metalness={0.5} roughness={0.24} />
          </mesh>

          <Text
            anchorX="left"
            anchorY="top"
            color="#f5e7c8"
            fontSize={0.082}
            maxWidth={0.7}
            position={[-1.99, 2.32, 1.19]}
            textAlign="left"
          >
            {'BIG 711\nREG 104\nBELL 15\nPLUM 10\nMELON 8\nCHERRY 2\nRPLY xBET'}
          </Text>

          <Text anchorX="left" anchorY="middle" color="#f8f1de" fontSize={0.105} position={[-1.98, 3.26, 1.19]}>
            {`CREDIT ${credits.toString().padStart(2, '0')}`}
          </Text>
          <Text anchorX="left" anchorY="middle" color="#f8f1de" fontSize={0.105} position={[-1.98, 3.04, 1.19]}>
            {`BET ${bet}`}
          </Text>
          <Text anchorX="left" anchorY="middle" color={lastOutcome.color} fontSize={0.105} position={[-1.98, 2.82, 1.19]}>
            {`PAYOUT ${lastOutcome.payout}`}
          </Text>

          <Text anchorX="center" anchorY="middle" color={lastOutcome.color} fontSize={0.12} position={[1.67, 3.02, 1.19]}>
            {lastOutcome.title}
          </Text>
          <Text
            anchorX="center"
            anchorY="middle"
            color={isSpinning ? '#67e8f9' : lastOutcome.color}
            fontSize={0.095}
            maxWidth={1.7}
            position={[0, 1.74, 1.19]}
            textAlign="center"
          >
            {message}
          </Text>

          <ControlButton color="#3b82f6" enabled={!isSpinning} label="MEDAL" onPress={insertMedal} position={[-1.35, 0.98, 1.23]} />
          <ControlButton color="#ef4444" enabled={!isSpinning && bet < 3 && credits > bet} label="BET 1" onPress={betOne} position={[-0.45, 0.98, 1.23]} />
          <ControlButton color="#f59e0b" enabled={!isSpinning && credits > 0} label="MAX" onPress={maxBet} position={[0.45, 0.98, 1.23]} />
          <ControlButton color="#22c55e" enabled={!isSpinning && bet > 0} label="LEVER" onPress={startSpin} position={[1.35, 1.12, 1.23]} size={[0.62, 0.3, 0.36]} />

          <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
            <boxGeometry args={[4.8, 0.16, 2.5]} />
            <meshStandardMaterial color="#2a1f1f" metalness={0.35} roughness={0.55} />
          </mesh>

          <pointLight color={lastOutcome.color} distance={4.5} intensity={isSpinning ? 1.8 : lastOutcome.kind === 'MISS' ? 0.45 : 1.25} position={[0, 4.2, 0.9]} />
        </group>
      </RigidBody>
    </group>
  )
}
