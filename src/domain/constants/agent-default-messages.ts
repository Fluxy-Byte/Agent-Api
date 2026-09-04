/// Defaults usados quando o campo é omitido na criação do agente — todo agente
/// "vem com default" (EscopoSaas). Só prefill de conveniência: o valor
/// realmente salvo é sempre explícito no banco (não há "herança" de default em
/// runtime), então trocar esta constante não afeta agentes já criados.
export const AGENT_DEFAULT_MESSAGES = {
  processingMessage: "Estamos pensando na resposta, aguarde um instante.",
  transferMessage: "Vou te encaminhar para um de nossos atendentes. Aguarde só um instante.",
  unsupportedFormatMessage: "Desculpe, ainda não consigo processar esse tipo de mensagem. Pode me enviar em texto?",
  blockedMessage:
    "No momento não conseguimos continuar o atendimento por este canal. Se precisar de suporte, entre em contato por outro meio.",
  outOfHoursMessage: "No momento estamos fora do horário de atendimento humano. Retornaremos assim que possível.",
  closingMessage:
    "Obrigado pelo contato! Encerrando este atendimento por aqui. Se precisar de algo mais, é só chamar. 👋",
  errorMessage: "Desculpe, tivemos um problema ao processar sua mensagem. Tente novamente em instantes.",
} as const;

/// Default de Agent.personality — mesmo princípio das mensagens acima (só
/// prefill de conveniência, sempre gravado explícito no banco).
export const DEFAULT_AGENT_PERSONALITY =
  "Comunique-se de forma cordial, clara e objetiva, como um atendente profissional e prestativo.";

/// Campos obrigatórios (sem switch de desativação). Os outros três
/// (outOfHours/closing/error) têm par mensagem+enabled, e quando
/// enabled=false "a Inteligência Artificial pode gerar qualquer resposta"
/// naquele cenário.
export const REQUIRED_AGENT_MESSAGE_FIELDS = [
  "processingMessage",
  "transferMessage",
  "unsupportedFormatMessage",
  "blockedMessage",
] as const;

export const TOGGLEABLE_AGENT_MESSAGE_FIELDS = [
  "outOfHoursMessage",
  "closingMessage",
  "errorMessage",
] as const;
