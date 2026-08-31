import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../../config/env";

const ALGORITHM = "aes-256-gcm";
/// 12 bytes é o tamanho recomendado de IV para GCM (NIST SP 800-38D) — outros
/// tamanhos funcionam mas custam um passo extra de hash interno no OpenSSL.
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = Buffer.from(env.AGENT_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("AGENT_TOKEN_ENCRYPTION_KEY precisa decodificar (base64) para exatamente 32 bytes (AES-256).");
  }
  return key;
}

/// Cifra um token de terceiro (OpenAI/Gemini) antes de gravar no banco.
/// Formato armazenado: "<iv>.<authTag>.<ciphertext>", cada parte em base64,
/// tudo num único campo TEXT — nunca o valor em claro chega perto do banco.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

/// Decifra um valor gravado por encryptToken. Lança se o formato estiver
/// corrompido ou se a tag de autenticação não bater (ex: chave errada).
export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado em formato inválido.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);

  return plaintext.toString("utf8");
}

/// Prévia segura pra exibir na UI (nunca o token completo): decifra e devolve
/// só os 6 primeiros caracteres. null quando não há token gravado.
export function previewToken(stored: string | null): string | null {
  if (!stored) return null;
  return decryptToken(stored).slice(0, 6);
}

/// Decifra com fallback null em vez de lançar — usado nos pontos que repassam
/// o token pra outro serviço (ex: envio do payload de ingestão RAG pro
/// AI-Worker): um valor corrompido ou uma chave desatualizada não pode
/// derrubar a operação inteira, só deixa aquele token específico ausente (o
/// consumidor cai pro fallback do próprio env do processo).
export function tryDecryptToken(stored: string | null, label: string): string | null {
  if (!stored) return null;
  try {
    return decryptToken(stored);
  } catch (error) {
    console.error(`Falha ao decifrar ${label}:`, error);
    return null;
  }
}
