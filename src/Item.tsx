import { useEffect, useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { DoubleSide, Shape } from 'three'
import { rollLeverHitKind } from './leverLottery'
import { ALL_PAYLINES, getActivePaylines, isHorizontalPayline, type PaylineDefinition } from './paylines'
import {
  MISS_OUTCOME,
  evaluateBoard,
  resolveSpinBet,
  resolveBonusFlag,
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
const PEDESTAL_HEIGHT = 4.8

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

function wrapDistance(current: number, target: number, length: number): number {
  return ((target - current) % length + length) % length
}

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
  const fontSize = label.length > 4 ? 0.135 : label.length > 2 ? 0.16 : 0.21

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
  const pendingSpinSettlementRef = useRef(false)
  const [reels, setReels] = useState<ReelState[]>(() => createInitialReels())
  const [credits, setCredits] = useState(START_CREDITS)
  const [bet, setBet] = useState(0)
  const [message, setMessage] = useState('INSERT MEDAL')
  const [lastOutcome, setLastOutcome] = useState<Outcome>(MISS_OUTCOME)
  const [bonusFlag, setBonusFlag] = useState<BonusFlag | null>(null)
  const [spinHitKind, setSpinHitKind] = useState<HitKind | null>(null)
  const [debugDrawKind, setDebugDrawKind] = useState<HitKind | null>(null)
  const [debugConfirmedKind, setDebugConfirmedKind] = useState<HitKind | null>(null)
  const [debugSpinBet, setDebugSpinBet] = useState(0)
  const isSpinning = reels.some((reel) => reel.isSpinning)
  const spinBet = resolveSpinBet(bet, lastOutcome)
  const activePaylines = getActivePaylines(bet)
  const activePaylineIds = new Set(activePaylines.map((payline) => payline.id))
  const displayedPaylines = ALL_PAYLINES.filter((payline) => {
    return activePaylineIds.has(payline.id) || isHorizontalPayline(payline)
  })
  const activeOutcome = spinHitKind === null ? lastOutcome : MISS_OUTCOME
  const panelTitle = bonusFlag === 'BIG' ? 'BIG BONUS' : bonusFlag === 'REG' ? 'REG BONUS' : lastOutcome.title
  const panelColor = bonusFlag === 'BIG' ? '#fbbf24' : bonusFlag === 'REG' ? '#f472b6' : lastOutcome.color
  const debugActiveLines = getActivePaylines(debugSpinBet)
  const debugDrawLabel = `抽選役 ${debugDrawKind ?? '---'}`
  const debugConfirmedLabel = `確定役 ${debugConfirmedKind ?? '---'}`
  const debugPaylineLabel = `有効ライン ${debugActiveLines.length === 0 ? '---' : debugActiveLines.map((payline) => PAYLINE_DEBUG_LABELS[payline.id]).join('/')}`

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
    setReels((current) => {
      return current.map((reel, reelIndex) => ({
        position: reel.position,
        targetIndex: wrapIndex(Math.round(reel.position), REEL_STRIPS[reelIndex].length),
        stopAt: null,
        isSpinning: true,
      }))
    })
  }

  const stopReel = (reelIndex: number) => {
    if (!isSpinning || spinHitKind === null) {
      return
    }

    setReels((current) => {
      const lockedCenterIndices = current.map((reel, index) => {
        if (index === reelIndex || (reel.isSpinning && reel.stopAt === null)) {
          return null
        }

        return wrapIndex(
          reel.stopAt === null ? Math.round(reel.position) : reel.targetIndex,
          REEL_STRIPS[index].length,
        )
      }) as [number | null, number | null, number | null]

      return current.map((reel, index) => {
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
        const extraTravel = 6 + index * 1.4
        return {
          ...reel,
          targetIndex: resolution.stopIndex,
          stopAt: reel.position + extraTravel + wrapDistance(reel.position, resolution.stopIndex, stripLength),
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
        const finishedIndices = next.map((reel, reelIndex) => {
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
              emissive={activeOutcome.kind === 'MISS' ? '#16110f' : activeOutcome.color}
              emissiveIntensity={isSpinning ? 0.78 : activeOutcome.kind === 'MISS' ? 0.15 : 0.42}
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
            { label: 'BIG', x: -1.08, active: bonusFlag === 'BIG', color: '#fbbf24' },
            { label: 'REG', x: 0, active: bonusFlag === 'REG', color: '#f472b6' },
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

          {displayedPaylines.map((payline) => {
            const active = activePaylineIds.has(payline.id)
            const { length, position: paylinePosition, rotation } = paylineMeshTransform(payline)

            return (
              <mesh key={payline.id} position={paylinePosition} rotation={rotation}>
                <boxGeometry args={[length, PAYLINE_DISPLAY_THICKNESS, PAYLINE_DISPLAY_THICKNESS]} />
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

          <ControlButton color="#3b82f6" enabled={!isSpinning} label="MEDAL" onPress={insertMedal} position={[-1.35, 0.98, 1.23]} />
          <ControlButton color="#ef4444" enabled={!isSpinning && bet < 3 && credits > bet} label="BET 1" onPress={betOne} position={[-0.45, 0.98, 1.23]} />
          <ControlButton color="#f59e0b" enabled={!isSpinning && credits > 0} label="MAX" onPress={maxBet} position={[0.45, 0.98, 1.23]} />
          <ControlButton color="#22c55e" enabled={!isSpinning && spinBet > 0} label="LEVER" onPress={startSpin} position={[1.35, 1.12, 1.23]} size={[0.62, 0.3, 0.36]} />

          <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
            <boxGeometry args={[4.8, 0.16, 2.5]} />
            <meshStandardMaterial color="#2a1f1f" metalness={0.35} roughness={0.55} />
          </mesh>

          <pointLight color={activeOutcome.color} distance={4.5} intensity={isSpinning ? 1.8 : activeOutcome.kind === 'MISS' ? 0.45 : 1.25} position={[0, 4.2, 0.9]} />
        </group>
      </RigidBody>
    </group>
  )
}
