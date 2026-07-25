import type { Request, RequestHandler, Response } from "express";
import type { PermissionAction } from "../../../domain/enums/permission-action";
import { AppError, UnauthorizedError } from "../../../domain/errors/app-error";
import { authorizationService } from "../../../application/authorization/authorization-service";
import { prisma } from "../../../infrastructure/database/prisma/client";
import { getAuthUser } from "./session";
import type { AuthUser } from "../types/auth-user";

interface ApiHandlerOptions {
  /// Ação exigida da matriz de permissões. Omitir = qualquer usuário
  /// autenticado (ainda sujeito a requireCompany).
  action?: PermissionAction;
  /// false para rotas que não dependem de uma empresa ativa (ex: listar/criar
  /// empresas, trocar empresa ativa).
  requireCompany?: boolean;
}

type Handler = (req: Request, res: Response, user: AuthUser) => Promise<unknown>;

export function apiHandler(handlerOrOptions: Handler | ApiHandlerOptions, maybeHandler?: Handler): RequestHandler {
  const options: ApiHandlerOptions = typeof handlerOrOptions === "function" ? {} : handlerOrOptions;
  const handler = typeof handlerOrOptions === "function" ? handlerOrOptions : maybeHandler!;
  const requireCompany = options.requireCompany ?? true;

  return async (req, res) => {
    try {
      const user = await getAuthUser(req);

      if (requireCompany && !user.activeOrganizationId) {
        throw new UnauthorizedError("Nenhuma empresa ativa selecionada.");
      }

      if (options.action) {
        authorizationService.assert(user, options.action);
      }

      const result = await handler(req, res, user);

      if (res.headersSent) return;

      res.json({ success: true, result, message: null });
    } catch (error) {
      await logError(req, error);

      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, result: null, message: error.message });
        return;
      }

      console.error("Erro não tratado:", error);
      res.status(500).json({ success: false, result: null, message: "Erro interno do servidor." });
    }
  };
}

async function logError(req: Request, error: unknown): Promise<void> {
  try {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Erros esperados (validação/permissão/etc.) não poluem o ErrorLog — só
    // falhas de verdade (500) valem a pena persistir para investigação.
    if (statusCode < 500) return;

    await prisma.errorLog.create({
      data: { route: req.originalUrl, message, stack, statusCode },
    });
  } catch (loggingError) {
    console.error("Falha ao gravar ErrorLog:", loggingError);
  }
}
