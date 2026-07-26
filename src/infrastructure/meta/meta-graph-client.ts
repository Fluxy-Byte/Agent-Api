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
