import { Resend } from "resend";
import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";

const APP_URL = env.CORS_ORIGIN || "http://localhost:3000";
const FROM_NAME = "Elevated Core Health";
const FROM_EMAIL = env.FROM_EMAIL;

function brandedWrapper(htmlBody: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elevated Core Health</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F5F7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header / Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:44px;height:44px;background-color:#036638;border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;font-weight:800;color:#FFFFFF;line-height:44px;">ECH</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-size:20px;font-weight:700;color:#036638;letter-spacing:-0.3px;">Elevated Core Health</span>
                    <br />
                    <span style="font-size:12px;color:#6B7280;">Patient Pipeline Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              ${htmlBody}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.5;">
                Elevated Core Health &bull; Patient Pipeline Portal<br />
                This is an automated notification. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buttonHtml(url: string, text: string): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 8px 0;">
  <tr>
    <td align="center" style="background-color:#036638;border-radius:8px;padding:0;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;background-color:#036638;">${text}</a>
    </td>
  </tr>
</table>`;
}

type SendEmailParams = {
	to: string | string[];
	subject: string;
	html: string;
};

async function sendResend(params: SendEmailParams): Promise<void> {
	if (!env.RESEND_API_KEY) {
		logger.warn({ to: params.to, subject: params.subject }, "RESEND_API_KEY not set — skipping email");
		return;
	}

	try {
		const resend = new Resend(env.RESEND_API_KEY);
		const { data, error } = await resend.emails.send({
			from: `My App <onboarding@resend.dev>`,
			to: Array.isArray(params.to) ? params.to : [params.to],
			subject: params.subject,
			html: params.html,
		});
		if (error) {
			logger.error({ to: params.to, subject: params.subject, error }, "Resend API returned an error");
			throw new Error(error.message ?? "Resend API error");
		}
		logger.info({ to: params.to, subject: params.subject, id: data?.id }, "Email sent successfully");
	} catch (err) {
		logger.error({ err, to: params.to, subject: params.subject }, "Failed to send email");
		throw err;
	}
}

export const emailService = {
	/**
	 * Notify both VAs when a new patient is created via webhook intake.
	 * Email includes patient details + claim link.
	 */
	async notifyNewPatient(
		patientName: string,
		patientId: string,
		vaEmails: string[],
		details?: { appointment?: string; platform?: string },
	) {
		const claimUrl = `${APP_URL}/dashboard/board?claim=${patientId}`;

		const detailsHtml = [
			details?.platform
				? `<p style="margin:4px 0;font-size:14px;color:#4B5563;"><strong>Source:</strong> ${details.platform}</p>`
				: "",
			details?.appointment
				? `<p style="margin:4px 0;font-size:14px;color:#4B5563;"><strong>Appointment:</strong> ${details.appointment}</p>`
				: "",
		]
			.filter(Boolean)
			.join("");

		const html = brandedWrapper(`
<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#1A1B1E;">New Patient Available</h2>
<p style="margin:0 0 16px 0;font-size:14px;color:#6B7280;line-height:1.6;">
  A new patient has been added to the pipeline and needs a VA to take responsibility.
</p>
<div style="background-color:#EBF7EC;border-left:4px solid #036638;border-radius:6px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:16px;font-weight:600;color:#036638;">${patientName}</p>
  ${detailsHtml}
</div>
<p style="margin:0 0 4px 0;font-size:14px;color:#374151;font-weight:500;">Take responsibility for this patient:</p>
${buttonHtml(claimUrl, "Claim This Patient")}
<p style="margin:12px 0 0 0;font-size:13px;color:#9CA3AF;">
  Or <a href="${APP_URL}/dashboard/board" target="_blank" style="color:#036638;text-decoration:underline;">view the board</a> to see all patients.
</p>
`);

		const errors: string[] = [];
		await Promise.all(
			vaEmails.map(async (email) => {
				try {
					await sendResend({ to: email, subject: `New patient available: ${patientName}`, html });
				} catch {
					errors.push(email);
				}
			}),
		);

		if (errors.length > 0) {
			logger.error({ patientName, patientId, failedEmails: errors }, "notifyNewPatient: some emails failed");
		}
	},

	/**
	 * Notify the other VA when a patient is claimed.
	 */
	async notifyClaimed(patientName: string, claimedBy: string, otherVaEmail: string) {
		const html = brandedWrapper(`
<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#1A1B1E;">Patient Claimed</h2>
<div style="background-color:#EBF7EC;border-left:4px solid #036638;border-radius:6px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:16px;font-weight:600;color:#036638;">${patientName}</p>
  <p style="margin:4px 0 0 0;font-size:14px;color:#4B5563;">Claimed by <strong>${claimedBy}</strong></p>
</div>
<p style="margin:0 0 4px 0;font-size:14px;color:#6B7280;line-height:1.6;">
  This patient is no longer available for assignment.
</p>
${buttonHtml(`${APP_URL}/dashboard/board`, "View Board")}
`);

		await sendResend({
			to: otherVaEmail,
			subject: `Patient ${patientName} was claimed by ${claimedBy}`,
			html,
		});
	},

	/**
	 * Send password reset email with a reset link.
	 */
	async sendPasswordReset(email: string, resetToken: string) {
		const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

		const html = brandedWrapper(`
<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#1A1B1E;">Reset Your Password</h2>
<p style="margin:0 0 4px 0;font-size:14px;color:#6B7280;line-height:1.6;">
  You requested a password reset for your Elevated Core Health Pipeline Portal account.
</p>
<p style="margin:0 0 16px 0;font-size:14px;color:#6B7280;line-height:1.6;">
  Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
</p>
${buttonHtml(resetUrl, "Reset Password")}
<p style="margin:12px 0 0 0;font-size:13px;color:#9CA3AF;">
  If you did not request this password reset, you can safely ignore this email.
</p>
`);

		await sendResend({ to: email, subject: "Password Reset — Elevated Core Health", html });
	},

	/**
	 * Notify Donna (admin) when a patient is flagged.
	 */
	async notifyFlagged(patientName: string, flaggedBy: string, reason: string, adminEmail: string) {
		const html = brandedWrapper(`
<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#1A1B1E;">🚩 Patient Flagged for Review</h2>
<div style="background-color:#FEF2F2;border-left:4px solid #DC2626;border-radius:6px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:16px;font-weight:600;color:#DC2626;">${patientName}</p>
  <p style="margin:6px 0 0 0;font-size:14px;color:#4B5563;">
    <strong>Flagged by:</strong> ${flaggedBy}
  </p>
  <p style="margin:4px 0 0 0;font-size:14px;color:#4B5563;">
    <strong>Reason:</strong> ${reason}
  </p>
</div>
${buttonHtml(`${APP_URL}/admin/dashboard`, "Review in Admin Dashboard")}
`);

		await sendResend({
			to: adminEmail,
			subject: `FLAG: ${patientName} needs your review`,
			html,
		});
	},
};
