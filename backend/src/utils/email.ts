import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

export async function sendPasswordResetEmail(to: string, token: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Återställ ditt lösenord – BMAD",
    html: `
      <p>Hej!</p>
      <p>Vi fick en begäran om att återställa lösenordet för ditt konto.</p>
      <p><a href="${FRONTEND_URL}/reset-password/${token}">Klicka här för att välja nytt lösenord</a></p>
      <p>Länken gäller i <strong>1 timme</strong>. Om du inte begärt detta kan du ignorera mailet.</p>
    `
  });
}
