import nodemailer from "nodemailer";
import { env } from "../../config/env";

/// Transporte único via Gmail SMTP (senha de app, não a senha normal da
/// conta) — usado hoje só para o e-mail de redefinição de senha do Better
/// Auth (emailAndPassword.sendResetPassword).
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.GMAIL_USER,
    pass: env.PASSWORD_GOOGLE,
  },
});

function resetPasswordEmailHtml(userName: string, url: string): string {
  return `
<div style="background-color:#f4f4f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5ea;">
    <div style="background:linear-gradient(135deg,#6d3df2,#8c5cf6);padding:28px 32px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;">Fluxy Agents</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">Redefinir senha</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525b;">
        Olá${userName ? `, ${userName}` : ""}. Recebemos um pedido para redefinir a senha da sua conta no Fluxy Agents.
        Clique no botão abaixo para escolher uma nova senha.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${url}" style="background-color:#6d3df2;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">
          Redefinir senha
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#a1a1aa;">
        Se você não pediu essa redefinição, pode ignorar este e-mail com segurança — sua senha atual continua valendo.
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
        O link expira em 1 hora. Se o botão não funcionar, copie e cole este endereço no navegador:<br />
        <span style="word-break:break-all;">${url}</span>
      </p>
    </div>
  </div>
</div>`;
}

export async function sendResetPasswordEmail(input: { to: string; userName: string; url: string }): Promise<void> {
  await transporter.sendMail({
    from: `"Fluxy Agents" <${env.GMAIL_USER}>`,
    to: input.to,
    subject: "Redefinir sua senha — Fluxy Agents",
    html: resetPasswordEmailHtml(input.userName, input.url),
  });
}
