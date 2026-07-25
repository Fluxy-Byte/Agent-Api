/// Defaults usados quando o campo é omitido na criação do agente — todo agente
/// "vem com default" (EscopoSaas). Só prefill de conveniência: o valor
/// realmente salvo é sempre explícito no banco (não há "herança" de default em
/// runtime), então trocar esta constante não afeta agentes já criados.
export const AGENT_DEFAULT_MESSAGES = {
  welcomeMessage: "Olá! 👋 Seja bem-vindo(a). Como posso te ajudar hoje?",
  processingMessage: "Estamos pensando na resposta, aguarde um instante.",
  transferMessage: "Vou te encaminhar para um de nossos atendentes. Aguarde só um instante.",
  unsupportedFormatMessage: "Desculpe, ainda não consigo processar esse tipo de mensagem. Pode me enviar em texto?",
  outOfHoursMessage: "No momento estamos fora do horário de atendimento humano. Retornaremos assim que possível.",
  closingMessage:
    "Obrigado pelo contato! Encerrando este atendimento por aqui. Se precisar de algo mais, é só chamar. 👋",
  errorMessage: "Desculpe, tivemos um problema ao processar sua mensagem. Tente novamente em instantes.",
} as const;

/// Campos obrigatórios (sem switch de desativação) — o EscopoSaas é explícito:
/// só estes três. Os outros quatro (welcome/outOfHours/closing/error) têm par
/// mensagem+enabled, e quando enabled=false "a Inteligência Artificial pode
/// gerar qualquer resposta" naquele cenário.
export const REQUIRED_AGENT_MESSAGE_FIELDS = [
  "processingMessage",
  "transferMessage",
  "unsupportedFormatMessage",
] as const;

export const TOGGLEABLE_AGENT_MESSAGE_FIELDS = [
  "welcomeMessage",
  "outOfHoursMessage",
  "closingMessage",
  "errorMessage",
] as const;
