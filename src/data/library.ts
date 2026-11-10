import type { LoadMode, Muscle } from '../db'

export const MUSCLES: { id: Muscle; label: string }[] = [
  { id: 'peito', label: 'Peito' },
  { id: 'costas', label: 'Costas' },
  { id: 'ombro', label: 'Ombro' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'perna', label: 'Perna' },
  { id: 'panturrilha', label: 'Panturrilha' },
  { id: 'abdomen', label: 'Abdômen' },
]

export const muscleLabel = (m: Muscle | null | undefined) =>
  MUSCLES.find((x) => x.id === m)?.label ?? 'Outro'

export const LOAD_MODES: { id: LoadMode; label: string; short: string }[] = [
  { id: 'total', label: 'Carga total', short: 'carga total' },
  { id: 'halter', label: 'Carga por halter', short: 'carga por halter' },
  { id: 'barra', label: 'Carga sem a barra', short: 'carga sem a barra' },
]

export const loadLabel = (m: LoadMode) => LOAD_MODES.find((x) => x.id === m)!.label
export const loadShort = (m: LoadMode) => LOAD_MODES.find((x) => x.id === m)!.short

interface LibItem {
  id: string
  name: string
  muscle: Muscle
  loadMode: LoadMode
  step?: number
}

const T = 'total' as const
const H = 'halter' as const
const B = 'barra' as const

const raw: [Muscle, [string, string, LoadMode, number?][]][] = [
  [
    'peito',
    [
      ['supino-reto-barra', 'Supino reto com barra', B],
      ['supino-reto-halter', 'Supino reto com halteres', H],
      ['supino-inclinado-barra', 'Supino inclinado com barra', B],
      ['supino-inclinado-halter', 'Supino inclinado com halteres', H],
      ['supino-declinado', 'Supino declinado com barra', B],
      ['supino-maquina', 'Supino na máquina', T, 5],
      ['supino-inclinado-maquina', 'Supino inclinado na máquina', T, 5],
      ['crucifixo-halter', 'Crucifixo com halteres', H],
      ['crucifixo-inclinado-halter', 'Crucifixo inclinado com halteres', H],
      ['peck-deck', 'Peck deck (voador)', T, 5],
      ['crossover', 'Crossover', T, 5],
      ['flexao', 'Flexão de braço', T],
      ['paralelas', 'Paralelas', T],
    ],
  ],
  [
    'costas',
    [
      ['puxada-frontal', 'Puxada frontal', T, 5],
      ['puxada-triangulo', 'Puxada com triângulo', T, 5],
      ['puxada-supinada', 'Puxada supinada', T, 5],
      ['barra-fixa', 'Barra fixa', T],
      ['remada-curvada', 'Remada curvada com barra', B],
      ['remada-unilateral', 'Remada unilateral com halter', H],
      ['remada-baixa', 'Remada baixa', T, 5],
      ['remada-cavalinho', 'Remada cavalinho', T],
      ['remada-maquina', 'Remada na máquina', T, 5],
      ['pulldown', 'Pulldown na polia', T, 5],
      ['levantamento-terra', 'Levantamento terra', B],
      ['lombar-banco', 'Extensão lombar (banco romano)', T],
    ],
  ],
  [
    'ombro',
    [
      ['desenvolvimento-halter', 'Desenvolvimento com halteres', H],
      ['desenvolvimento-barra', 'Desenvolvimento com barra', B],
      ['desenvolvimento-maquina', 'Desenvolvimento na máquina', T, 5],
      ['elevacao-lateral', 'Elevação lateral com halteres', H, 1],
      ['elevacao-lateral-polia', 'Elevação lateral na polia', T, 2.5],
      ['elevacao-frontal', 'Elevação frontal', H],
      ['crucifixo-inverso', 'Crucifixo inverso', H],
      ['crucifixo-inverso-maquina', 'Crucifixo inverso na máquina', T, 5],
      ['face-pull', 'Face pull', T, 2.5],
      ['remada-alta', 'Remada alta', B],
      ['encolhimento', 'Encolhimento com halteres', H],
    ],
  ],
  [
    'biceps',
    [
      ['rosca-direta', 'Rosca direta com barra', B],
      ['rosca-w', 'Rosca direta barra W', B],
      ['rosca-alternada', 'Rosca alternada com halteres', H],
      ['rosca-martelo', 'Rosca martelo', H],
      ['rosca-scott', 'Rosca Scott', B],
      ['rosca-polia', 'Rosca na polia', T, 2.5],
      ['rosca-concentrada', 'Rosca concentrada', H],
      ['rosca-inclinada', 'Rosca inclinada com halteres', H],
    ],
  ],
  [
    'triceps',
    [
      ['triceps-pulley', 'Tríceps pulley', T, 2.5],
      ['triceps-corda', 'Tríceps corda', T, 2.5],
      ['triceps-testa', 'Tríceps testa', B],
      ['triceps-frances', 'Tríceps francês', H],
      ['triceps-coice', 'Tríceps coice', H],
      ['triceps-banco', 'Mergulho no banco', T],
      ['supino-fechado', 'Supino fechado', B],
    ],
  ],
  [
    'perna',
    [
      ['agachamento-livre', 'Agachamento livre', B],
      ['agachamento-smith', 'Agachamento no Smith', B],
      ['agachamento-hack', 'Agachamento hack', T, 10],
      ['agachamento-bulgaro', 'Agachamento búlgaro', H],
      ['agachamento-sumo', 'Agachamento sumô', H],
      ['leg-press', 'Leg press 45°', T, 10],
      ['leg-press-horizontal', 'Leg press horizontal', T, 5],
      ['cadeira-extensora', 'Cadeira extensora', T, 5],
      ['mesa-flexora', 'Mesa flexora', T, 5],
      ['cadeira-flexora', 'Cadeira flexora', T, 5],
      ['stiff', 'Stiff', B],
      ['afundo', 'Afundo / passada', H],
      ['elevacao-pelvica', 'Elevação pélvica', B],
      ['cadeira-abdutora', 'Cadeira abdutora', T, 5],
      ['cadeira-adutora', 'Cadeira adutora', T, 5],
      ['gluteo-polia', 'Glúteo na polia', T, 2.5],
    ],
  ],
  [
    'panturrilha',
    [
      ['panturrilha-pe', 'Panturrilha em pé', T, 5],
      ['panturrilha-sentado', 'Panturrilha sentado', T, 5],
      ['panturrilha-leg', 'Panturrilha no leg press', T, 10],
    ],
  ],
  [
    'abdomen',
    [
      ['abdominal-supra', 'Abdominal supra', T],
      ['abdominal-infra', 'Abdominal infra', T],
      ['abdominal-polia', 'Abdominal na polia', T, 5],
      ['abdominal-maquina', 'Abdominal na máquina', T, 5],
      ['elevacao-pernas', 'Elevação de pernas', T],
      ['prancha', 'Prancha', T],
    ],
  ],
]

export const LIBRARY: LibItem[] = raw.flatMap(([muscle, list]) =>
  list.map(([id, name, loadMode, step]) => ({ id, name, muscle, loadMode, step })),
)
