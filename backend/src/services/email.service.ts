import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";

type SendEmailParams = {
	to: string | string[];
	subject: string;
	html: string;
};

async function sendResend(params: SendEmailParams): Promise<void> {
	if (!env.RESEND_API_KEY) {
		logger.warn("RESEND_API_KEY not set — skipping email notification");
		return;
	}

	try {
		const { Resend } = await import("resend");
		const resend = new Resend(env.RESEND_API_KEY);
		await resend.emails.send({
			from: "Elevated Core Health <notifications@elevatedcorehealth.com>",
			to: Array.isArray(params.to) ? params.to : [params.to],
			subject: params.subject,
			html: params.html,
		});
		logger.info({ to: params.to, subject: params.subject }, "Email sent");
	} catch (err) {
		logger.error({ err, to: params.to, subject: params.subject }, "Failed to send email");
	}
}

export const emailService = {
	async notifyNewPatient(patientName: string, patientId: string, vaEmails: { jude: string; amanda: string }) {
		const appUrl = env.CORS_ORIGIN || "http://localhost:5173";
		const claimLink = `${appUrl}/board?claim=${patientId}`;

		const html = `
<h2>New Patient Available</h2>
<p>A new patient has been added to the pipeline:</p>
<p><strong>${patientName}</strong></p>
<p>Click below to take responsibility for this patient:</p>
<a href="${claimLink}" style="display:inline-block;padding:12px 24px;background:#E8792E;color:#fff;text-decoration:none;border-radius:6px;font-size:16px;">
  Take Responsibility
</a>
<p style="margin-top:16px;font-size:12px;color:#666;">
  Or log in to the portal to view and claim patients at <a href="${appUrl}">${appUrl}</a>
</p>
`;

		await Promise.all([
			sendResend({ to: vaEmails.jude, subject: `New patient: ${patientName}`, html }),
			sendResend({ to: vaEmails.amanda, subject: `New patient: ${patientName}`, html }),
		]);
	},

	async notifyClaimed(patientName: string, claimedBy: string, otherVaEmail: string) {
		const html = `
<h2>Patient Claimed</h2>
<p><strong>${patientName}</strong> has been claimed by <strong>${claimedBy}</strong>.</p>
<p style="font-size:12px;color:#666;">
  This patient is no longer available for assignment. Log in to view the current board.
</p>
`;

		await sendResend({
			to: otherVaEmail,
			subject: `Patient ${patientName} was claimed by ${claimedBy}`,
			html,
		});
	},

	async notifyFlagged(patientName: string, flaggedBy: string, reason: string, adminEmail: string) {
		const html = `
<h2>Patient Flagged for Review</h2>
<p><strong>${patientName}</strong> was flagged by <strong>${flaggedBy}</strong>.</p>
<p><strong>Reason:</strong> ${reason}</p>
<p style="font-size:12px;color:#666;">
  Log in to the admin dashboard to review and clear this flag.
</p>
`;

		await sendResend({
			to: adminEmail,
			subject: `FLAG: ${patientName} needs review`,
			html,
		});
	},
};
