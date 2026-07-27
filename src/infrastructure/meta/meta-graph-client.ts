import { env } from "../../config/env";
import { UpstreamError } from "../../domain/errors/app-error";

export interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
}

interface MetaPhoneNumbersResponse {
  data: MetaPhoneNumber[];
}

interface MetaErrorResponse {
  error?: { message?: string };
}

/// Consulta a Graph API pra listar todos os números de telefone cadastrados
/// em um WhatsApp Business Account — usado no cadastro em massa de canais a
/// partir de um WABA ID já existente na Meta.
export async function listWabaPhoneNumbers(wabaId: string): Promise<MetaPhoneNumber[]> {
  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${wabaId}/phone_numbers`;

  const response = await fetch(`${url}?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`);
  const body = (await response.json()) as MetaPhoneNumbersResponse & MetaErrorResponse;

  if (!response.ok) {
    throw new UpstreamError(body.error?.message ?? "Falha ao consultar os números do WABA na Meta.");
  }

  return body.data ?? [];
}

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: { type: string; text: string }[];
}

export interface MetaTemplate {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  status: string;
  components: MetaTemplateComponent[];
}

interface MetaTemplatesResponse {
  data: MetaTemplate[];
}

/// Conta quantas variáveis {{1}}, {{2}}... existem em um texto de componente —
/// usado pra saber quantos campos de preenchimento mostrar por contato no
/// disparo de campanha (CSV ou manual).
function countVariables(text?: string): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

export function getTemplateVariableCount(components: MetaTemplateComponent[]): { header: number; body: number } {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  return {
    header: countVariables(header?.text),
    body: countVariables(body?.text),
  };
}

/// Lista os templates de mensagem cadastrados no WABA (aprovados ou não) —
/// usado na etapa de escolha de template do disparo de campanha.
export async function listWabaTemplates(wabaId: string): Promise<MetaTemplate[]> {
  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${wabaId}/message_templates`;

  const response = await fetch(`${url}?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`);
  const body = (await response.json()) as MetaTemplatesResponse & MetaErrorResponse;

  if (!response.ok) {
    throw new UpstreamError(body.error?.message ?? "Falha ao consultar os templates do WABA na Meta.");
  }

  return body.data ?? [];
}
