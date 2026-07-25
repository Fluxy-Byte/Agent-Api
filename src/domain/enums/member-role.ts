/// Papel por organização. NÃO é um enum do Postgres (Member.role é String livre,
/// porque o plugin organization do Better Auth é quem gerencia esse campo a
/// nível de schema) — este union type é a fonte de verdade a nível de aplicação.
/// Administrador não é um valor aqui: é a flag global User.role === "admin" do
/// plugin admin do Better Auth, ortogonal ao papel por organização.
export const MEMBER_ROLES = ["GERENTE", "SUPERVISOR", "ATENDENTE"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}
