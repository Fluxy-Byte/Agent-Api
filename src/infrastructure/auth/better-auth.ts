import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization } from "better-auth/plugins";
import { env } from "../../config/env";
import { prisma } from "../database/prisma/client";

/// Tenant = Organization (empresa). Member.role guarda um dos papéis por-empresa
/// (GERENTE | SUPERVISOR | ATENDENTE) — validado em código, não no banco (ver
/// src/domain/enums/member-role.ts). O papel Administrador é tratado à parte,
/// como flag de plataforma via admin() plugin (User.role === "admin"): acesso a
/// todas as empresas, independente do que Member diz.
///
/// Importante: a criação de Organization+Member SEMPRE passa pelo nosso próprio
/// CompanyRepository (src/application/company), nunca pela API de criação de
/// organização do Better Auth — assim o Member.role já nasce com um valor
/// válido do nosso union type (GERENTE), em vez do default genérico do plugin.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  /// Validação de origem do próprio Better Auth — independente do middleware
  /// CORS do Express, precisa da mesma lista de origens do frontend.
  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin(),
    organization({
      schema: {
        organization: {
          additionalFields: {
            cnpj: { type: "string", required: true },
            status: { type: "string", required: false, defaultValue: "ACTIVE" },
          },
        },
      },
    }),
  ],
});
