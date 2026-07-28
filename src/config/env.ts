import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(7073),

  DATABASE_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),

  /// Origens do frontend com permissão para chamadas com cookies
  /// (credentials: "include") — CORS com wildcard "*" não funciona com
  /// credentials, então isso precisa ser uma lista explícita.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(
      "https://agentes.fluxytechnologies.com.br,https://desk.fluxytechnologies.com.br,http://localhost:7072,http://localhost:7080",
    )
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  INTERNAL_API_KEY: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().min(1),

  RABBITMQ_URL: z.string().min(1),

  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().default("orquestrador"),

  SEAWEEDFS_S3_ENDPOINT: z.string().min(1),
  SEAWEEDFS_S3_ACCESS_KEY: z.string().min(1),
  SEAWEEDFS_S3_SECRET_KEY: z.string().min(1),
  SEAWEEDFS_S3_BUCKET: z.string().min(1),
  SEAWEEDFS_S3_REGION: z.string().default("us-east-1"),
  SEAWEEDFS_S3_PREFIX: z.string().default("fluxy-saas/agent-api"),

  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),

  /// Usado para consultar a Graph API da Meta (ex.: listar os números de
  /// telefone cadastrados em um WABA) — mesmo token do Inbound-Service.
  META_ACCESS_TOKEN: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),

  /// Base URL do Campaign-Worker (POST /campaign/send) — autenticado com o
  /// mesmo INTERNAL_API_KEY acima.
  CAMPAIGN_WORKER_URL: z.string().min(1),

  /// Base URL do AI-Worker/max (POST /rag/ingest) — autenticado com o mesmo
  /// INTERNAL_API_KEY acima.
  MAX_WORKER_URL: z.string().min(1),

  /// Conta Gmail usada pra enviar o e-mail de redefinição de senha (Better
  /// Auth emailAndPassword.sendResetPassword) — PASSWORD_GOOGLE é uma senha de
  /// app do Gmail (não a senha normal da conta).
  GMAIL_USER: z.string().min(1),
  PASSWORD_GOOGLE: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
