import { useEffect, useState, type FormEvent } from 'react'
import {
  endRecovery,
  errorText,
  linkAccount,
  needsMergeChoice,
  sendPasswordReset,
  setNewPassword,
  signIn,
  signOut,
  signUp,
  skipLogin,
  useSync,
} from '../lib/sync'
import { IconDumbbell } from '../components/Icons'
import { toast } from '../components/ui'

type Mode = 'entrar' | 'criar' | 'esqueci'

/** Tela de entrada: entrar, criar conta, esqueci a senha e "usar sem conta". */
export function AuthScreen() {
  const sync = useSync()
  if (sync.user && !sync.linked) return <LinkStep />
  return <LoginForm />
}

function Brand({ sub }: { sub: string }) {
  return (
    <div className="auth-brand">
      <span className="auth-logo">
        <IconDumbbell size={34} />
      </span>
      <h1>Treino</h1>
      <p className="muted">{sub}</p>
    </div>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<Mode>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'entrar') await signIn(email, password)
      else if (mode === 'criar') {
        const mustConfirm = await signUp(email, password)
        if (mustConfirm) setInfo('Conta criada! Abra o link que mandamos para o seu e-mail e depois entre aqui.')
      } else {
        await sendPasswordReset(email)
        setInfo('Se esse e-mail tiver conta, chega um link para criar uma senha nova.')
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  return (
    <main className="auth">
      <Brand sub="Entre para guardar seus treinos na nuvem e usar em qualquer celular." />

      {mode !== 'esqueci' && (
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={mode === 'entrar'} onClick={() => go('entrar')}>
            Entrar
          </button>
          <button role="tab" aria-selected={mode === 'criar'} onClick={() => go('criar')}>
            Criar conta
          </button>
        </div>
      )}
      {mode === 'esqueci' && <p className="lead small-lead">Criar uma senha nova</p>}

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== 'esqueci' && (
          <label className="field">
            <span>Senha{mode === 'criar' ? ' (mínimo 6 caracteres)' : ''}</span>
            <input
              type="password"
              autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="auth-msg error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="auth-msg" role="status">
            {info}
          </p>
        )}

        <button className="btn primary block big" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>

      {mode === 'entrar' && (
        <button className="btn text block" onClick={() => go('esqueci')}>
          Esqueci a senha
        </button>
      )}
      {mode === 'esqueci' && (
        <button className="btn text block" onClick={() => go('entrar')}>
          Voltar para entrar
        </button>
      )}

      <div className="auth-skip">
        <button className="btn ghost block" onClick={skipLogin}>
          Usar sem conta por enquanto
        </button>
        <p className="muted small center">
          Os dados ficam só neste celular. Dá para entrar depois em Histórico → Conta.
        </p>
      </div>
    </main>
  )
}

/** Depois de entrar: liga os dados deste celular à conta (perguntando se precisar). */
function LinkStep() {
  const sync = useSync()
  const [choice, setChoice] = useState<'checking' | 'ask' | 'working'>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    needsMergeChoice()
      .then(async (ask) => {
        if (!alive) return
        if (ask) setChoice('ask')
        else {
          setChoice('working')
          await linkAccount('merge')
        }
      })
      .catch((e) => alive && setError(errorText(e)))
    return () => {
      alive = false
    }
  }, [])

  const pick = async (mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !confirm('Apagar os treinos deste celular e ficar só com os da conta?')) return
    setChoice('working')
    try {
      await linkAccount(mode)
    } catch (e) {
      setError(errorText(e))
      setChoice('ask')
    }
  }

  return (
    <main className="auth">
      <Brand sub={sync.user?.email ?? ''} />
      {error ? (
        <>
          <p className="auth-msg error" role="alert">
            {error}
          </p>
          <button className="btn primary block big" onClick={() => location.reload()}>
            Tentar de novo
          </button>
          <button className="btn text block" onClick={() => signOut()}>
            Sair da conta
          </button>
        </>
      ) : choice === 'ask' ? (
        <>
          <p className="lead small-lead">Este celular já tem treinos, e a sua conta também.</p>
          <p className="muted">O que fazer com os treinos deste celular?</p>
          <button className="btn primary block big" onClick={() => pick('merge')}>
            Juntar com os da conta
          </button>
          <button className="btn ghost block" onClick={() => pick('replace')}>
            Usar só os da conta
          </button>
          <p className="muted small center">“Usar só os da conta” apaga os treinos que estão só neste celular.</p>
        </>
      ) : (
        <p className="muted center pad">Preparando sua conta…</p>
      )}
    </main>
  )
}

/** Aberta pelo link de "esqueci a senha". */
export function NewPasswordScreen() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="auth">
      <Brand sub="Crie sua senha nova." />
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await setNewPassword(password)
            toast('Senha alterada')
          } catch (err) {
            setError(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="field">
          <span>Senha nova (mínimo 6 caracteres)</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="auth-msg error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary block big" disabled={busy}>
          {busy ? 'Aguarde…' : 'Salvar senha'}
        </button>
      </form>
      <button className="btn text block" onClick={endRecovery}>
        Agora não
      </button>
    </main>
  )
}
