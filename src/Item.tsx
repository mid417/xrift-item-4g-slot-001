import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DoubleSide, Shape, Vector3, type Group } from 'three'
import { advanceReelAnimation, resolveStopPosition } from './itemAnimation'
import { rollLeverHitKind } from './leverLottery'
import { ALL_PAYLINES, getActivePaylines, isHorizontalPayline, type PaylineDefinition } from './paylines'
import {
  MISS_OUTCOME,
  evaluateBoard,
  resolveBonusFlag,
  resolveSpinControls,
  resolveStopIndex,
  type BonusFlag,
  type HitKind,
  type Outcome,
  wrapIndex,
} from './slotLogic'
import { REEL_STRIPS, REEL_SYMBOLS_PER_STRIP, type ReelSymbol } from './reelStrips'

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const ITEM_MODEL_SCALE = 1 / 5
const ITEM_BASE_Y_SCALE_COMPENSATION = 1 / ITEM_MODEL_SCALE
const PEDESTAL_HEIGHT = 0.97

interface ReelState {
  position: number
  targetIndex: number
  stopAt: number | null
  isSpinning: boolean
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
const PAYLINE_DISPLAY_WIDTH = 2.56
const PAYLINE_DISPLAY_THICKNESS = 0.03
const PAYLINE_DISPLAY_Z = 1.19
const MIN_STOP_TRAVEL = 6
const MIN_STOP_TRAVEL_STEP = 1.4
const SYMBOL_LABELS: Record<ReelSymbol, string> = {
  RED_7: '7',
  BLUE_7: 'V',
  BAR: 'BAR',
  BELL: 'BELL',
  CHERRY: 'CHRY',
  REPLAY: 'RPLY',
  MELON: 'MLON',
}

const SYMBOL_COLORS: Record<ReelSymbol, string> = {
  RED_7: '#ef4444',
  BLUE_7: '#052efa',
  BAR: '#111827',
  BELL: '#facc15',
  CHERRY: '#fb7185',
  REPLAY: '#9ac8ff',
  MELON: '#34d399',
}

const PAYLINE_DEBUG_LABELS = {
  top: 'TOP',
  center: 'CTR',
  bottom: 'BTM',
  diagonalDown: 'DOWN',
  diagonalUp: 'UP',
} as const

function lineY(rowOffset: number): number {
  return WINDOW_CENTER_Y - rowOffset * ROW_HEIGHT
}

function paylineMeshTransform(payline: PaylineDefinition) {
  const startY = lineY(payline.rowOffsets[0])
  const endY = lineY(payline.rowOffsets[2])
  const deltaY = endY - startY

  return {
    length: Math.sqrt(PAYLINE_DISPLAY_WIDTH ** 2 + deltaY ** 2),
    position: [0, (startY + endY) / 2, PAYLINE_DISPLAY_Z] as [number, number, number],
    rotation: [0, 0, Math.atan2(deltaY, PAYLINE_DISPLAY_WIDTH)] as [number, number, number],
  }
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

const ACTIVE_PAYLINES_BY_BET = [0, 1, 2, 3].map((currentBet) => getActivePaylines(currentBet))
const ACTIVE_PAYLINE_ID_SETS_BY_BET = ACTIVE_PAYLINES_BY_BET.map((paylines) => new Set(paylines.map((payline) => payline.id)))
const DISPLAYED_PAYLINES_BY_BET = ACTIVE_PAYLINE_ID_SETS_BY_BET.map((paylineIds) => {
  return ALL_PAYLINES.filter((payline) => paylineIds.has(payline.id) || isHorizontalPayline(payline))
})
const PAYLINE_MESH_TRANSFORMS = new Map(ALL_PAYLINES.map((payline) => [payline.id, paylineMeshTransform(payline)]))
const REEL_BEZELS = [
  {
    key: 'top',
    position: [0, (REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER) / 2, REEL_PANEL_Z - REEL_BEZEL_DEPTH / 2] as [number, number, number],
    size: [REEL_BEZEL_WIDTH, REEL_BEZEL_BORDER, REEL_BEZEL_DEPTH] as [number, number, number],
  },
  {
    key: 'bottom',
    position: [0, -(REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER) / 2, REEL_PANEL_Z - REEL_BEZEL_DEPTH / 2] as [number, number, number],
    size: [REEL_BEZEL_WIDTH, REEL_BEZEL_BORDER, REEL_BEZEL_DEPTH] as [number, number, number],
  },
  {
    key: 'left',
    position: [-(REEL_BEZEL_WIDTH - REEL_BEZEL_BORDER) / 2, 0, REEL_PANEL_Z - REEL_BEZEL_DEPTH / 2] as [number, number, number],
    size: [REEL_BEZEL_BORDER, REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER * 2, REEL_BEZEL_DEPTH] as [number, number, number],
  },
  {
    key: 'right',
    position: [(REEL_BEZEL_WIDTH - REEL_BEZEL_BORDER) / 2, 0, REEL_PANEL_Z - REEL_BEZEL_DEPTH / 2] as [number, number, number],
    size: [REEL_BEZEL_BORDER, REEL_BEZEL_HEIGHT - REEL_BEZEL_BORDER * 2, REEL_BEZEL_DEPTH] as [number, number, number],
  },
] as const
const STATUS_LAMPS = [
  { label: 'BIG', x: -1.08, kind: 'BIG', color: '#fbbf24' },
  { label: 'REG', x: 0, kind: 'REG', color: '#f472b6' },
  { label: 'SPIN', x: 1.08, kind: 'SPIN', color: '#67e8f9' },
] as const
const DEFAULT_CONTROL_BUTTON_SIZE: [number, number, number] = [0.58, 0.18, 0.34]
const CONTROL_BUTTON_LAYOUTS = {
  medal: {
    position: [-1.68, 1.4, 1.23] as [number, number, number],
  },
  betOne: {
    position: [-0.45, 1.4, 1.23] as [number, number, number],
  },
  max: {
    position: [0.45, 1.4, 1.23] as [number, number, number],
  },
  lever: {
    position: [1.35, 1.6, 1.23] as [number, number, number],
    size: [0.62, 0.3, 0.36] as [number, number, number],
  },
  chairToggle: {
    position: [0, 0.52, 1.18] as [number, number, number],
    size: [0.76, 0.16, 0.32] as [number, number, number],
  },
} as const
const CHAIR_POSITION: [number, number, number] = [0, 0, 3]
const CHAIR_VISIBLE_POSITION: [number, number, number] = [CHAIR_POSITION[0], CHAIR_POSITION[1], CHAIR_POSITION[2] + 0.8]
const CHAIR_SEAT_SIZE: [number, number, number] = [1.67, 0.48, 2]
const CHAIR_SEAT_COLLIDER_ARGS: [number, number, number] = [0.835, 0.24, 0.72]
const CHAIR_SEAT_POSITION: [number, number, number] = [0, 4.04, 0]
const CHAIR_BACKREST_SIZE: [number, number, number] = [1.67, 1.8, 0.16]
const CHAIR_BACKREST_COLLIDER_ARGS: [number, number, number] = [0.835, 0.9, 0.08]
const CHAIR_BACKREST_POSITION: [number, number, number] = [0, 5.16, 0.9]
const CHAIR_LEG_SIZE: [number, number, number] = [0.16, 3.8, 0.16]
const CHAIR_LEG_COLLIDER_ARGS: [number, number, number] = [0.08, 1.9, 0.08]
const CHAIR_LEG_POSITIONS = [
  [-0.63, 1.9, -0.56],
  [0.63, 1.9, -0.56],
  [-0.63, 1.9, 0.56],
  [0.63, 1.9, 0.56],
] as const

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

// 制御ボタン - MEDAL、BET 1、MAX、CHAIR ON/OFF、LEVER などのボタン表示と機能を持つコンポーネント
const ControlButton = memo(function ControlButton({
  label,
  position,
  color,
  enabled,
  onPress,
  size = DEFAULT_CONTROL_BUTTON_SIZE,
}: ControlButtonProps) {
  const [hovered, setHovered] = useState(false)
  const faceColor = enabled ? color : '#5a4a45'
  const glowColor = enabled ? color : '#241716'

  return (
    <group position={position}>
      {/* このオブジェクトはコントロールボタン（メダル・BET・MAX・レバーなど）のグループ */}
      {/* ボタン背面の暗いベース */}
      <mesh position={[0, -0.01, -0.03]} receiveShadow>
        <boxGeometry args={[size[0] + 0.1, size[1] + 0.1, 0.08]} />
        <meshStandardMaterial color="#120d10" metalness={0.65} roughness={0.36} />
      </mesh>
      {/* ボタン本体（クリッカブルなメイン部分） */}
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
      {/* ボタンのラベル背景部分 */}
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
})


interface ReelSymbolCardProps {
  symbol: ReelSymbol
}

// リール上の表示シンボルカード - リールに配置される各シンボルの表面メッシュとテキスト表示
const ReelSymbolCard = memo(function ReelSymbolCard({ symbol }: ReelSymbolCardProps) {
  const label = SYMBOL_LABELS[symbol]
  const faceColor = symbol === 'BAR' ? '#111827' : SYMBOL_COLORS[symbol]
  const textColor = symbol === 'BAR' ? '#fff8ea' : '#111111'
  const outlineColor = symbol === 'BAR' ? '#241718' : '#fff8ea'
  const fontSize = label.length > 4 ? 0.135 : label.length > 2 ? 0.16 : 0.21

  return (
    <group>
      {/* このオブジェクトはリール上の１つのシンボルカード（7、BAR、BELLなど） */}
      {/* シンボルカード本体（白いベース） */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[REEL_CARD_WIDTH, REEL_CARD_HEIGHT, REEL_CARD_DEPTH]} />
        <meshBasicMaterial color="#fffaf0" />
      </mesh>
      {/* シンボルの表面色 */}
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
})

interface ReelDrumProps {
  reelIndex: number
  reelX: number
  reelsRef: MutableRefObject<ReelState[]>
  stopEnabled: boolean
  onStop: (reelIndex: number) => void
}

// リールドラム - シンボルを回転表示するドラム、ベゼル、ガラス、クリック判定エリアを含む
const ReelDrum = memo(function ReelDrum({ reelIndex, reelX, reelsRef, stopEnabled, onStop }: ReelDrumProps) {
  const strip = REEL_STRIPS[reelIndex]
  const drumRef = useRef<Group>(null)
  const handleStop = useCallback(() => {
    onStop(reelIndex)
  }, [onStop, reelIndex])
  const symbolTransforms = useMemo(() => {
    return strip.map((_symbol, symbolIndex) => {
      const angle = symbolIndex * REEL_SYMBOL_ANGLE
      return {
        key: `${reelIndex}-${symbolIndex}`,
        position: [0, Math.sin(angle) * REEL_RADIUS, Math.cos(angle) * REEL_RADIUS] as [number, number, number],
        rotation: [-angle, 0, 0] as [number, number, number],
      }
    })
  }, [reelIndex, strip])

  useFrame(() => {
    if (drumRef.current === null) {
      return
    }

    drumRef.current.rotation.x = reelsRef.current[reelIndex].position * REEL_SYMBOL_ANGLE
  })

  return (
    <group position={[reelX, WINDOW_CENTER_Y, 0]}>
      {/* このオブジェクトはリール本体（回転ドラム）のグループ */}
      {/* リールの枠飾り（ベゼル） */}
      {REEL_BEZELS.map((bezel) => (
        <mesh key={bezel.key} position={bezel.position}>
          <boxGeometry args={bezel.size} />
          <meshStandardMaterial color="#1a1315" emissive="#080608" emissiveIntensity={0.12} metalness={0.42} roughness={0.38} />
        </mesh>
      ))}
      {/* リール本体（回転するシンボルドラム） */}
      <group position={[0, 0, REEL_DRUM_CENTER_Z]} ref={drumRef}>
        {/* リールの中心軸 */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[REEL_CORE_RADIUS, REEL_CORE_RADIUS, REEL_CARD_WIDTH * 0.96, 32, 1, true]} />
          <meshStandardMaterial color="#cabf9e" emissive="#84755d" emissiveIntensity={0.12} metalness={0.2} roughness={0.52} />
        </mesh>
        {/* リール上のシンボルカード */}
        {strip.map((symbol, symbolIndex) => {
          const symbolTransform = symbolTransforms[symbolIndex]
          return (
            <group
              key={symbolTransform.key}
              position={symbolTransform.position}
              rotation={symbolTransform.rotation}
            >
              <ReelSymbolCard symbol={symbol} />
            </group>
          )
        })}
      </group>
      {/* リールウィンドウガラス */}
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
      {/* リール停止ボタン（クリッカブルエリア） */}
      <mesh onClick={stopEnabled ? handleStop : undefined} position={[0, 0, REEL_CLICK_Z]}>
        <boxGeometry args={[REEL_WINDOW_WIDTH + 0.06, REEL_WINDOW_HEIGHT + 0.06, 0.08]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
})

export const Item = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => {
  const { camera, size } = useThree()
  const spinBetRef = useRef(0)
  const pendingSpinSettlementRef = useRef(false)
  const initialReelsRef = useRef<ReelState[] | null>(null)
  if (initialReelsRef.current === null) {
    initialReelsRef.current = createInitialReels()
  }
  const initialReels = initialReelsRef.current
  const reelsRef = useRef<ReelState[]>(initialReels)
  const [reels, setReels] = useState<ReelState[]>(initialReels)
  const [credits, setCredits] = useState(START_CREDITS)
  const [bet, setBet] = useState(0)
  const [message, setMessage] = useState('INSERT MEDAL')
  const [lastOutcome, setLastOutcome] = useState<Outcome>(MISS_OUTCOME)
  const [bonusFlag, setBonusFlag] = useState<BonusFlag | null>(null)
  const [spinHitKind, setSpinHitKind] = useState<HitKind | null>(null)
  const [debugDrawKind, setDebugDrawKind] = useState<HitKind | null>(null)
  const [debugConfirmedKind, setDebugConfirmedKind] = useState<HitKind | null>(null)
  const [debugSpinBet, setDebugSpinBet] = useState(0)
  const [isChairVisible, setIsChairVisible] = useState(false)
  const isSpinning = reels.some((reel) => reel.isSpinning)
  const { activePaylineBet: spinBet, canBetOne, canMaxBet, canLever, isReplayReady } = resolveSpinControls({
    bet,
    credits,
    isSpinning,
    lastOutcome,
  })
  const activePaylineIds = ACTIVE_PAYLINE_ID_SETS_BY_BET[spinBet]
  const displayedPaylines = DISPLAYED_PAYLINES_BY_BET[spinBet]
  const activeOutcome = spinHitKind === null ? lastOutcome : MISS_OUTCOME
  const panelTitle = bonusFlag === 'BIG' ? 'BIG BONUS' : bonusFlag === 'REG' ? 'REG BONUS' : lastOutcome.title
  const panelColor = bonusFlag === 'BIG' ? '#fbbf24' : bonusFlag === 'REG' ? '#f472b6' : lastOutcome.color
  const debugActiveLines = ACTIVE_PAYLINES_BY_BET[debugSpinBet]
  const debugDrawLabel = `抽選役 ${debugDrawKind ?? '---'}`
  const debugConfirmedLabel = `確定役 ${debugConfirmedKind ?? '---'}`
  const debugPaylineLabel = `有効ライン ${debugActiveLines.length === 0 ? '---' : debugActiveLines.map((payline) => PAYLINE_DEBUG_LABELS[payline.id]).join('/')}`

  const insertMedal = useCallback(() => {
    if (isSpinning) {
      return
    }

    setCredits((current) => Math.min(99, current + 10))
    setMessage('MEDAL +10')
  }, [isSpinning])

  const betOne = useCallback(() => {
    if (isSpinning) {
      return
    }

    if (isReplayReady) {
      setMessage(lastOutcome.detail)
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
  }, [bet, credits, isReplayReady, isSpinning, lastOutcome.detail])

  const maxBet = useCallback(() => {
    if (isSpinning) {
      return
    }

    if (isReplayReady) {
      setMessage(lastOutcome.detail)
      return
    }

    const nextBet = Math.min(3, credits)
    if (nextBet === 0) {
      setMessage('INSERT MEDAL')
      return
    }

    setBet(nextBet)
    setMessage(`MAX BET ${nextBet}`)
  }, [credits, isReplayReady, isSpinning, lastOutcome.detail])

  const startSpin = useCallback(() => {
    if (isSpinning) {
      return
    }

    if (spinBet === 0) {
      setMessage('BET 1-3')
      return
    }

    const resultKind = rollLeverHitKind(bonusFlag !== null)

    if (resultKind === 'BIG' || resultKind === 'REG') {
      setBonusFlag(resultKind)
    }

    spinBetRef.current = spinBet
    setCredits((current) => current - bet)
    setBet(0)
    setSpinHitKind(resultKind)
    setDebugDrawKind(resultKind)
    setDebugConfirmedKind(null)
    setDebugSpinBet(spinBet)
    pendingSpinSettlementRef.current = true
    setMessage('LEVER ON / TOUCH WINDOWS')
    setReels(() => {
      const next = reelsRef.current.map((reel, reelIndex) => ({
        position: reel.position,
        targetIndex: wrapIndex(Math.round(reel.position), REEL_STRIPS[reelIndex].length),
        stopAt: null,
        isSpinning: true,
      }))
      reelsRef.current = next
      return next
    })
  }, [bonusFlag, isSpinning, spinBet, bet])

  const stopReel = useCallback((reelIndex: number) => {
    if (!isSpinning || spinHitKind === null) {
      return
    }

    setReels(() => {
      const currentReels = reelsRef.current
      const lockedCenterIndices = currentReels.map((reel, index) => {
        if (index === reelIndex || (reel.isSpinning && reel.stopAt === null)) {
          return null
        }

        return wrapIndex(
          reel.stopAt === null ? Math.round(reel.position) : reel.targetIndex,
          REEL_STRIPS[index].length,
        )
      }) as [number | null, number | null, number | null]

      const next = currentReels.map((reel, index) => {
        if (index !== reelIndex || !reel.isSpinning || reel.stopAt !== null) {
          return reel
        }

        const stripLength = REEL_STRIPS[index].length
        const resolution = resolveStopIndex({
          reelIndex: index,
          currentPosition: reel.position,
          lockedCenterIndices,
          bet: spinBetRef.current,
          pendingKind: spinHitKind,
          bonusFlag,
        })
        const minimumTravel = MIN_STOP_TRAVEL + index * MIN_STOP_TRAVEL_STEP

        return {
          ...reel,
          targetIndex: resolution.stopIndex,
          stopAt: resolveStopPosition(reel.position, resolution.stopIndex, stripLength, minimumTravel),
        }
      })
      reelsRef.current = next
      return next
    })

    setMessage(`STOP ${reelIndex + 1}`)
  }, [bonusFlag, isSpinning, spinHitKind])

  const canStopReel = (reelIndex: number) => {
    return reels[reelIndex].isSpinning && reels[reelIndex].stopAt === null
  }

    const toggleChair = () => {
    setIsChairVisible((current) => !current)
  }

  useFrame((_state, delta) => {
    const currentReels = reelsRef.current
    if (!currentReels.some((reel) => reel.isSpinning)) {
      return
    }

    const next = currentReels.map((reel) => advanceReelAnimation(reel, delta))
    reelsRef.current = next

    if (!next.every((reel) => !reel.isSpinning)) {
      return
    }

    const finalized = next.map((reel, reelIndex) => ({
      ...reel,
      position: wrapIndex(Math.round(reel.position), REEL_STRIPS[reelIndex].length),
      stopAt: null,
      isSpinning: false,
    }))
    reelsRef.current = finalized
    setReels(finalized)
  })

  useEffect(() => {
    if (pendingSpinSettlementRef.current === false || isSpinning || spinHitKind === null) {
      return
    }

    pendingSpinSettlementRef.current = false

    const finishedIndices = reels.map((reel, reelIndex) => {
      return wrapIndex(Math.round(reel.position), REEL_STRIPS[reelIndex].length)
    }) as [number, number, number]
    const outcome = evaluateBoard(finishedIndices, spinBetRef.current)
    const returnedCredits = outcome.payout

    setCredits((current) => Math.min(999, current + returnedCredits))
    setLastOutcome(outcome)
    setDebugConfirmedKind(outcome.kind)
    setBonusFlag((currentBonusFlag) => resolveBonusFlag(currentBonusFlag, outcome.kind))
    setSpinHitKind(null)
    setMessage(outcome.detail)
    spinBetRef.current = 0
  }, [isSpinning, reels, spinHitKind])

  useEffect(() => {
    const qaTarget = globalThis as typeof globalThis & {
      __ITEM_QA__?: {
        getSnapshot: () => {
          credits: number
          bet: number
          message: string
          isChairVisible: boolean
          isSpinning: boolean
          canBetOne: boolean
          canMaxBet: boolean
          canLever: boolean
        }
        projectLocalPoint: (point: [number, number, number]) => { x: number; y: number }
      }
    }

    qaTarget.__ITEM_QA__ = {
      getSnapshot: () => ({
        credits,
        bet,
        message,
        isChairVisible,
        isSpinning,
        canBetOne,
        canMaxBet,
        canLever,
      }),
      projectLocalPoint: (point) => {
        const projected = camera.clone()
        projected.updateMatrixWorld()
        const vector = {
          x: point[0] * ITEM_MODEL_SCALE,
          y: point[1] * ITEM_MODEL_SCALE,
          z: point[2] * ITEM_MODEL_SCALE,
        }
        const worldPoint = {
          x: position[0] + vector.x,
          y: position[1] + vector.y,
          z: position[2] + vector.z,
        }
        const pointVector = new Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
        pointVector.project(projected)
        return {
          x: ((pointVector.x + 1) / 2) * size.width,
          y: ((1 - pointVector.y) / 2) * size.height,
        }
      },
    }

    return () => {
      delete qaTarget.__ITEM_QA__
    }
  }, [bet, camera, canBetOne, canLever, canMaxBet, credits, isChairVisible, isSpinning, message, position, size.height, size.width])

  return (
    <group position={position} scale={scale * ITEM_MODEL_SCALE}>
      {/* スロットマシン本体 - 固定リジッドボディ、ペデスタル、キャビネット、パネル、ボタン、椅子を包含 */}
      <RigidBody type="fixed" colliders="cuboid">
        <group position={[0, PEDESTAL_HEIGHT, 0]}>
          {/* ペデスタル（台座）- スロットマシン下部の支柱 */}
          <group scale={[1, ITEM_BASE_Y_SCALE_COMPENSATION, 1]}>
            <mesh castShadow receiveShadow position={[0, PEDESTAL_HEIGHT / 2 - PEDESTAL_HEIGHT / ITEM_BASE_Y_SCALE_COMPENSATION, 0]}>
              <boxGeometry args={[5, PEDESTAL_HEIGHT, 2.7]} />
              <meshStandardMaterial color="#201818" metalness={0.28} roughness={0.72} />
            </mesh>
          </group>
        </group>

        <group position={[0, 4.8, 0]}>
          {/* キャビネット本体 - メインの黒いキャビネット構造 */}
          <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
            <boxGeometry args={[4.4, 5, CABINET_BODY_DEPTH]} />
            <meshStandardMaterial color="#171215" metalness={0.68} roughness={0.34} />
          </mesh>

          {/* トップパネル - 結果表示背景の赤パネル部分 */}
          <mesh castShadow position={[0, 4.55, 1.08]}>
            <boxGeometry args={[3.72, 0.96, 0.18]} />
            <meshStandardMaterial color="#621d1d" emissive="#2d0d0b" emissiveIntensity={0.4} metalness={0.45} roughness={0.28} />
          </mesh>
          {/* 結果表示パネル - 結果に応じて色が変わる発光パネル */}
          <mesh castShadow position={[0, 4.55, 1.16]}>
            <boxGeometry args={[3.4, 0.68, 0.06]} />
            <meshStandardMaterial
              color="#4f463f"
              emissive={activeOutcome.kind === 'MISS' ? '#16110f' : activeOutcome.color}
              emissiveIntensity={isSpinning ? 0.78 : activeOutcome.kind === 'MISS' ? 0.15 : 0.42}
              metalness={0.25}
              roughness={0.18}
            />
          </mesh>
          {/* パネルタイトルライン - 上下のゴールドラインデコレーション */}
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

          {/* ステータスランプ - SPIN、BIG、REG 状態を示すランプ群 */}
          {STATUS_LAMPS.map((lamp) => {
            const active =
              lamp.kind === 'SPIN'
                ? isSpinning
                : lamp.kind === 'BIG'
                  ? bonusFlag === 'BIG'
                  : bonusFlag === 'REG'

            return (
              <group key={lamp.label} position={[lamp.x, 3.9, 1.14]}>
                <mesh>
                  <sphereGeometry args={[0.14, 20, 20]} />
                  <meshStandardMaterial
                    color={active ? lamp.color : '#4a3c38'}
                    emissive={active ? lamp.color : '#140f10'}
                    emissiveIntensity={active ? 1.1 : 0.05}
                    metalness={0.2}
                    roughness={0.18}
                  />
                </mesh>
                <mesh position={[0, -0.18, -0.03]}>
                  <boxGeometry args={[0.44, 0.08, 0.05]} />
                  <meshStandardMaterial color={active ? lamp.color : '#49363a'} emissive={active ? lamp.color : '#1a1113'} emissiveIntensity={active ? 0.45 : 0.08} metalness={0.22} roughness={0.25} />
                </mesh>
                <Text anchorX="center" anchorY="middle" color="#f9ead5" fontSize={0.075} position={[0, -0.3, 0.06]}>
                  {lamp.label}
                </Text>
              </group>
            )
          })}

          {/* リールパネル背面 - リール表示エリアの背面の暗いパネル */}
          <mesh position={[0, WINDOW_CENTER_Y, 0.92]} receiveShadow>
            <boxGeometry args={[2.72, REEL_PANEL_HEIGHT + 0.28, 0.08]} />
            <meshStandardMaterial color="#14171d" emissive="#0f1720" emissiveIntensity={0.3} metalness={0.45} roughness={0.22} />
          </mesh>
          {/* フロントパネル（枠） - リールを囲む前面の装飾枠 */}
          <mesh castShadow position={[0, WINDOW_CENTER_Y, REEL_PANEL_SHROUD_BACK_Z]} receiveShadow>
            <extrudeGeometry args={[FRONT_PANEL_SHAPE, { depth: REEL_PANEL_SHROUD_DEPTH, bevelEnabled: false }]} />
            <meshStandardMaterial color="#69615f" emissive="#1f1717" emissiveIntensity={0.18} metalness={0.75} roughness={0.18} />
          </mesh>

          {/* ペイラインディスプレイ - アクティブなペイラインを示す発光ライン群 */}
          {displayedPaylines.map((payline) => {
            const active = activePaylineIds.has(payline.id)
            const paylineTransform = PAYLINE_MESH_TRANSFORMS.get(payline.id)

            if (paylineTransform === undefined) {
              return null
            }

            return (
              <mesh key={payline.id} position={paylineTransform.position} rotation={paylineTransform.rotation}>
                <boxGeometry args={[paylineTransform.length, PAYLINE_DISPLAY_THICKNESS, PAYLINE_DISPLAY_THICKNESS]} />
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

          {/* リール群 - 3つのリールドラム（左中右） */}
          {REEL_X_POSITIONS.map((reelX, reelIndex) => {
            const stopEnabled = canStopReel(reelIndex)

            return (
              <ReelDrum
                key={reelIndex}
                onStop={stopReel}
                reelIndex={reelIndex}
                reelX={reelX}
                reelsRef={reelsRef}
                stopEnabled={stopEnabled}
              />
            )
          })}

          {/* 左サイドパネル - 上部：ペイテーブル、中部：クレジット/ベット/配当表示 */}
          <mesh position={[-1.67, 3.02, 1.08]}>
            <boxGeometry args={[0.78, 0.88, 0.1]} />
            <meshStandardMaterial color="#161215" emissive="#09070a" emissiveIntensity={0.18} metalness={0.42} roughness={0.24} />
          </mesh>
          {/* 右サイドパネル - 結果表示エリア */}
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
            {'BIG 711\nREG 104\nMELON 15\nBELL 8\nCHERRY 2\nRPLY xBET'}
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

          <Text anchorX="center" anchorY="middle" color={panelColor} fontSize={0.12} position={[1.67, 3.02, 1.19]}>
            {panelTitle}
          </Text>
          <Text anchorX="center" anchorY="top" color="#f8f1de" fontSize={0.05} maxWidth={1.2} position={[1.67, 2.83, 1.19]} textAlign="center">
            {`${debugDrawLabel}\n${debugConfirmedLabel}\n${debugPaylineLabel}`}
          </Text>
          <Text
            anchorX="center"
            anchorY="middle"
            color={spinHitKind === null ? lastOutcome.color : '#67e8f9'}
            fontSize={0.095}
            maxWidth={1.7}
            position={[0, 1.74, 1.19]}
            textAlign="center"
          >
            {message}
          </Text>

          {/* 制御ボタン群 - MEDAL、BET 1、MAX、CHAIR ON/OFF、LEVER ボタン配置 */}
          <ControlButton
            color="#3b82f6"
            enabled={!isSpinning}
            label="MEDAL"
            onPress={insertMedal}
            position={CONTROL_BUTTON_LAYOUTS.medal.position}
          />
          <ControlButton
            color="#ef4444"
            enabled={canBetOne}
            label="BET 1"
            onPress={betOne}
            position={CONTROL_BUTTON_LAYOUTS.betOne.position}
          />
          <ControlButton
            color="#f59e0b"
            enabled={canMaxBet}
            label="MAX BET"
            onPress={maxBet}
            position={CONTROL_BUTTON_LAYOUTS.max.position}
          />
          <ControlButton
            color={isChairVisible ? '#8b5cf6' : '#6366f1'}
            enabled
            label={isChairVisible ? 'CHAIR OFF' : 'CHAIR ON'}
            onPress={toggleChair}
            position={CONTROL_BUTTON_LAYOUTS.chairToggle.position}
            size={CONTROL_BUTTON_LAYOUTS.chairToggle.size}
          />
          <ControlButton
            color="#22c55e"
            enabled={canLever}
            label="LEVER"
            onPress={startSpin}
            position={CONTROL_BUTTON_LAYOUTS.lever.position}
            size={CONTROL_BUTTON_LAYOUTS.lever.size}
          />

          <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
            <boxGeometry args={[4.8, 0.16, 2.5]} />
            <meshStandardMaterial color="#2a1f1f" metalness={0.35} roughness={0.55} />
          </mesh>

          <pointLight color={activeOutcome.color} distance={4.5} intensity={isSpinning ? 1.8 : activeOutcome.kind === 'MISS' ? 0.45 : 1.25} position={[0, 4.2, 0.9]} />
        </group>
      </RigidBody>
      {/* 椅子 - 表示可能なオプション椅子（CHAIR ON/OFFボタンで表示/非表示切り替え） */}
      {isChairVisible ? (
        <RigidBody type="fixed" colliders={false}>
          <group position={CHAIR_VISIBLE_POSITION}>
            <CuboidCollider args={CHAIR_SEAT_COLLIDER_ARGS} position={CHAIR_SEAT_POSITION} />
            <CuboidCollider args={CHAIR_BACKREST_COLLIDER_ARGS} position={CHAIR_BACKREST_POSITION} />
            {CHAIR_LEG_POSITIONS.map((chairLegPosition, chairLegIndex) => (
              <CuboidCollider key={`chair-leg-collider-${chairLegIndex}`} args={CHAIR_LEG_COLLIDER_ARGS} position={chairLegPosition} />
            ))}
            {/* 椅子の座面 */}
            <mesh castShadow receiveShadow position={CHAIR_SEAT_POSITION}>
              <boxGeometry args={CHAIR_SEAT_SIZE} />
              <meshStandardMaterial color="#6b3f2f" emissive="#1f0f09" emissiveIntensity={0.16} metalness={0.22} roughness={0.56} />
            </mesh>
            {/* 椅子の背もたれ */}
            <mesh castShadow receiveShadow position={CHAIR_BACKREST_POSITION}>
              <boxGeometry args={CHAIR_BACKREST_SIZE} />
              <meshStandardMaterial color="#593327" emissive="#160d09" emissiveIntensity={0.14} metalness={0.18} roughness={0.58} />
            </mesh>
            {/* 椅子の脚（4本） */}
            {CHAIR_LEG_POSITIONS.map((chairLegPosition, chairLegIndex) => (
              <mesh castShadow receiveShadow key={`chair-leg-mesh-${chairLegIndex}`} position={chairLegPosition}>
                <boxGeometry args={CHAIR_LEG_SIZE} />
                <meshStandardMaterial color="#2a2629" metalness={0.64} roughness={0.32} />
              </mesh>
            ))}
          </group>
        </RigidBody>
      ) : null}
    </group>
  )
}
