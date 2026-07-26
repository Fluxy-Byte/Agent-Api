export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado.") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Sem permissão para executar esta ação.") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado.") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Dados inválidos.",
    public readonly issues?: unknown,
  ) {
    super(message, 422);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito ao processar a requisição.") {
    super(message, 409);
  }
}

export class UpstreamError extends AppError {
  constructor(message = "Falha ao se comunicar com um serviço externo.") {
    super(message, 502);
  }
}
