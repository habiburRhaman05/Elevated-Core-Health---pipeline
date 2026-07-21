/**
 * Diagnostic script to test Resend email sending directly.
 * Run: npx tsx src/test/email-diagnostic.ts
 */
import "dotenv/config";

async function main() {
	const apiKey = process.env.RESEND_API_KEY;
	const fromEmail = process.env.FROM_EMAIL ?? "notifications@elevatedcorehealth.com";

	console.log("=== Email Diagnostic ===");
	console.log(`RESEND_API_KEY: ${apiKey ? `✓ set (${apiKey.slice(0, 8)}...)` : "✗ NOT SET"}`);
	console.log(`FROM_EMAIL:     ${fromEmail}`);
	console.log(`CORS_ORIGIN:    ${process.env.CORS_ORIGIN ?? "not set"}`);
	console.log();

	if (!apiKey) {
		console.log("❌ RESEND_API_KEY is not set — add it to .env");
		process.exit(1);
	}

	try {
		const { Resend } = await import("resend");
		const resend = new Resend(apiKey);

		console.log("Sending test email...");
		const result = await resend.emails.send({
			from: `Elevated Core Health <${fromEmail}>`,
			to: ["donna@elevatedcore.com"], // Replace with your verified email
			subject: "ECH Pipeline — Email Diagnostic Test",
			html: `<h2>Diagnostic Test</h2><p>If you see this, email sending works.</p>`,
		});

		const resErr = result.error as { statusCode?: number; name?: string; message?: string } | null;
		if (resErr) {
			console.log("❌ Resend API returned an error:");
			console.log(JSON.stringify(resErr, null, 2));
			if (resErr.statusCode === 401) {
				console.log("\n💡 Tip: The API key is invalid — generate a new one at https://resend.com/api-keys");
			}
			if (resErr.name === "validation_error" && resErr.message?.includes("domain")) {
				console.log("\n💡 Tip: The from-email domain is not verified in Resend.");
			}
		} else if (result.data) {
			console.log(`✅ Email sent successfully! ID: ${result.data.id}`);
		} else {
			console.log("⚠️  Got response but no error and no data:");
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (err) {
		console.log("❌ Exception thrown:");
		console.log(err);
	}
}

main();
