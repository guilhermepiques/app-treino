// Projeto do Supabase usado para login e nuvem.
//
// Estes valores NÃO são senha nem segredo: a chave "publishable" foi feita para ficar no app
// (qualquer pessoa que abre o site consegue vê-la). Quem protege os dados são as regras de acesso
// (RLS) em supabase/schema.sql, que só deixam cada pessoa logada ler e gravar os próprios registros.
// NUNCA coloque aqui a chave "secret" / "service_role".
//
// Dá para trocar por variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_KEY) sem mexer no código.

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://gyfccqxqsotjiedncade.supabase.co'
export const SUPABASE_KEY = env.VITE_SUPABASE_KEY || 'sb_publishable_7WnwwIYKCg5qR6X6dWggeQ_SU93s6Np'
