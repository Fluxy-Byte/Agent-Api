-- Regra crítica do Desk Worker: uma mesma MessagingSession nunca pode ter mais
-- de um Ticket aberto (WAITING ou IN_PROGRESS) simultaneamente. Um índice
-- único parcial garante isso no nível do banco, não só na aplicação — uma
-- tentativa concorrente de abrir um segundo ticket para a mesma sessão falha
-- com violação de unique constraint, que o Desk-Worker deve tratar como sinal
-- definitivo de corrida perdida (não basta um SELECT prévio).
CREATE UNIQUE INDEX "uq_ticket_open_per_session" ON "Ticket" ("messagingSessionId") WHERE "status" <> 'CLOSED';
