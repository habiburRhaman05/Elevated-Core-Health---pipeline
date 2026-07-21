import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn<any, any>().mockResolvedValue({ data: { id: "mock-email-id-123" }, error: null });

vi.mock("resend", () => ({
	Resend: vi.fn(() => ({
		emails: { send: mockSend },
	})),
}));

const { emailService } = await import("@/services/email.service");

describe("emailService", () => {
	beforeEach(() => {
		mockSend.mockClear();
	});

	it("notifyNewPatient: sends to all VAs with claim link and patient details", async () => {
		await emailService.notifyNewPatient(
			"Jane Doe",
			"patient-123-uuid",
			["jude@test.com", "amanda@test.com"],
			{ appointment: "Mon, Jul 25, 2026 at 2:00 PM", platform: "zocdoc" },
		);

		expect(mockSend).toHaveBeenCalledTimes(2);
		const judeCall = mockSend.mock.calls.find((c: any[]) => c[0].to[0] === "jude@test.com")!;
		const html = judeCall[0].html;
		expect(html).toContain("/dashboard/board?claim=patient-123-uuid");
		expect(html).toContain("Claim This Patient");
		expect(html).toContain("Jane Doe");
		expect(html).toContain("zocdoc");
		expect(html).toContain("Mon, Jul 25, 2026");
		expect(html).toContain("Elevated Core Health");
		expect(html).toContain("Patient Pipeline Portal");
	});

	it("notifyNewPatient: handles missing optional details", async () => {
		await emailService.notifyNewPatient("John Smith", "patient-456-uuid", ["jude@test.com", "amanda@test.com"]);
		expect(mockSend).toHaveBeenCalledTimes(2);
		const html = mockSend.mock.calls[0][0].html;
		expect(html).toContain("John Smith");
		expect(html).toContain("/dashboard/board?claim=patient-456-uuid");
	});

	it("notifyNewPatient: skips sending when RESEND_API_KEY is unset", async () => {
		const { env } = await import("@/utils/envConfig");
		const orig = env.RESEND_API_KEY;
		(env as any).RESEND_API_KEY = undefined;
		await expect(
			emailService.notifyNewPatient("Test", "t-id", ["j@t.com", "a@t.com"]),
		).resolves.toBeUndefined();
		(env as any).RESEND_API_KEY = orig;
	});

	it("notifyClaimed: notifies other VA", async () => {
		await emailService.notifyClaimed("Jane Doe", "Jude", "amanda@test.com");
		expect(mockSend).toHaveBeenCalledTimes(1);
		const html = mockSend.mock.calls[0][0].html;
		expect(html).toContain("Jane Doe");
		expect(html).toContain("Jude");
		expect(html).toContain("/dashboard/board");
	});

	it("notifyFlagged: notifies admin", async () => {
		await emailService.notifyFlagged("Jane Doe", "Jude", "Missing labs", "donna@test.com");
		expect(mockSend).toHaveBeenCalledTimes(1);
		const html = mockSend.mock.calls[0][0].html;
		expect(html).toContain("Jane Doe");
		expect(html).toContain("Jude");
		expect(html).toContain("Missing labs");
		expect(html).toContain("/admin/dashboard");
	});

	it("sendPasswordReset: includes reset token link", async () => {
		await emailService.sendPasswordReset("jude@test.com", "reset-token-xyz");
		expect(mockSend).toHaveBeenCalledTimes(1);
		const html = mockSend.mock.calls[0][0].html;
		expect(html).toContain("reset-token-xyz");
		expect(html).toContain("Reset Password");
	});
});
