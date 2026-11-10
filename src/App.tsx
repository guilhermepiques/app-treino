import { useEffect, useState } from 'react'
import { useActiveWorkout } from './lib/actions'
import { FichaTab } from './screens/FichaTab'
import { TreinarTab } from './screens/TreinarTab'
import { HistoricoTab } from './screens/HistoricoTab'
import { EvolucaoTab } from './screens/EvolucaoTab'
import { IconChart, IconDumbbell, IconFicha, IconHistory } from './components/Icons'
import { Toaster } from './components/ui'

type Tab = 'ficha' | 'treinar' | 'evolucao' | 'historico'

const readTab = (): Tab => {
  try {
    const t = localStorage.getItem('tab')
    if (t === 'ficha' || t === 'treinar' || t === 'evolucao' || t === 'historico') return t
  } catch {
    /* sem storage */
  }
  return 'treinar'
}

export function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const active = useActiveWorkout()

  useEffect(() => {
    try {
      localStorage.setItem('tab', tab)
    } catch {
      /* sem storage */
    }
    window.scrollTo(0, 0)
  }, [tab])

  return (
    <div className="app">
      {tab === 'ficha' && <FichaTab />}
      {tab === 'treinar' && <TreinarTab goFicha={() => setTab('ficha')} />}
      {tab === 'evolucao' && <EvolucaoTab />}
      {tab === 'historico' && <HistoricoTab />}

      <nav className="tabbar" aria-label="Abas">
        <TabButton label="Ficha" active={tab === 'ficha'} onClick={() => setTab('ficha')} icon={<IconFicha />} />
        <TabButton
          label="Treinar"
          active={tab === 'treinar'}
          onClick={() => setTab('treinar')}
          icon={<IconDumbbell />}
          dot={!!active}
        />
        <TabButton
          label="Evolução"
          active={tab === 'evolucao'}
          onClick={() => setTab('evolucao')}
          icon={<IconChart />}
        />
        <TabButton
          label="Histórico"
          active={tab === 'historico'}
          onClick={() => setTab('historico')}
          icon={<IconHistory />}
        />
      </nav>
      <Toaster />
    </div>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  dot,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  dot?: boolean
}) {
  return (
    <button className={`tab${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">
        {icon}
        {dot && <span className="tab-dot" aria-label="treino em andamento" />}
      </span>
      <span>{label}</span>
    </button>
  )
}
