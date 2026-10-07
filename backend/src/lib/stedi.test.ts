import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
	checkStediEligibility,
	describeStediError,
	parseStediResponse,
	resolvePayerId,
	type StediEligibilityResponse,
} from "@/lib/stedi";

const activeResponse: StediEligibilityResponse = {
	id: "abc",
	subscriber: { memberId: "W123456789" },
	planInformation: { groupNumber: "GRP42" },
	plans: [
		{
			benefits: {
				statuses: [{ status: "ACTIVE_COVERAGE", coverageLevel: "INDIVIDUAL", insuranceType: "PREFERRED_PROVIDER_ORGANIZATION" }],
				coPayment: [
					{ coverageLevel: "INDIVIDUAL", amount: "75", network: { indicator: "OUT_OF_NETWORK" } },
					{ coverageLevel: "INDIVIDUAL", amount: "30", network: { indicator: "IN_NETWORK" } },
				],
				coInsurance: [{ coverageLevel: "INDIVIDUAL", percent: "0.2" }],
				deductible: [
					{ coverageLevel: "INDIVIDUAL", amount: "1500", timePeriod: "CALENDAR_YEAR" },
					{ coverageLevel: "INDIVIDUAL", amount: "400", timePeriod: "REMAINING" },
				],
				outOfPocket: [{ coverageLevel: "INDIVIDUAL", amount: "5000" }],
			},
		},
	],
};

function mockFetchOnce(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status });
}

describe("resolvePayerId", () => {
	it("maps known names (case-insensitive) and aliases", () => {
		expect(resolvePayerId("Aetna")).toBe("60054");
		expect(resolvePayerId("  UHC ")).toBe("87726");
		expect(resolvePayerId("Blue Cross Blue Shield of Texas")).toBe("00735");
	});
	it("accepts a raw payer ID and rejects unknown free text", () => {
		expect(resolvePayerId("12345")).toBe("12345");
		expect(resolvePayerId("Some Tiny Insurer Inc")).toBeNull();
		expect(resolvePayerId(null)).toBeNull();
		expect(resolvePayerId("")).toBeNull();
	});
});

describe("describeStediError", () => {
	it("uses a friendly message for known AAA codes and keeps the raw detail", () => {
		const msg = describeStediError({ code: "72", detail: "Invalid/Missing Subscriber/Insured ID" });
		expect(msg).toContain("member ID");
		expect(msg).toContain("Invalid/Missing Subscriber/Insured ID");
	});
	it("reads Stedi's `description` field", () => {
		expect(describeStediError({ code: "ZZ", description: "Something specific" })).toBe("Something specific");
		expect(describeStediError({ code: "73", description: "Invalid/Missing Subscriber/Insured Name" })).toContain("subscriber name");
	});
	it("falls back to the raw text for unknown codes", () => {
		expect(describeStediError({ code: "ZZ", detail: "weird" })).toBe("weird");
		expect(describeStediError({})).toBe("Unknown payer error");
	});
});

describe("parseStediResponse", () => {
	it("extracts in-network amounts, group number and deductible met", () => {
		const vob = parseStediResponse(activeResponse, "Aetna", false);
		expect(vob.coverage).toBe("Active");
		expect(vob.planType).toBe("PREFERRED PROVIDER ORGANIZATION");
		expect(vob.copay).toBe("$30"); // not the out-of-network $75
		expect(vob.coinsurance).toBe("20%");
		expect(vob.deductible).toBe("$1,500"); // total, not the remaining $400
		expect(vob.deductibleMet).toBe("$1,100");
		expect(vob.outOfPocketMax).toBe("$5,000");
		expect(vob.groupNumber).toBe("GRP42");
		expect(vob.memberId).toBe("W123456789");
		expect(vob.authorizationRequired).toBe(false);
		expect(vob.sandbox).toBe(false);
	});

	it("deductibleMet is N/A when no remaining amount is reported", () => {
		const r = structuredClone(activeResponse);
		r.plans![0].benefits!.deductible = [{ coverageLevel: "INDIVIDUAL", amount: "1500" }];
		expect(parseStediResponse(r, "Aetna", false).deductibleMet).toBe("N/A");
	});

	it("flags authorization when any benefit requires it", () => {
		const r = structuredClone(activeResponse);
		r.plans![0].benefits!.coPayment![1].authOrCertIndicator = true;
		expect(parseStediResponse(r, "Aetna", false).authorizationRequired).toBe(true);
	});

	it("reports visit limits when present, otherwise 'No limit reported'", () => {
		const r = structuredClone(activeResponse);
		expect(parseStediResponse(r, "Aetna", false).visitsCoveredPerYear).toBe("No limit reported");
		r.plans![0].benefits!.limitations = [{ quantity: { value: "20", qualifier: "VISITS" }, timePeriod: "CALENDAR_YEAR" }];
		expect(parseStediResponse(r, "Aetna", false).visitsCoveredPerYear).toBe("20 visits per calendar year");
	});

	it("ignores non-visit limits such as max dependent age", () => {
		const r = structuredClone(activeResponse);
		r.plans![0].benefits!.limitations = [{ quantity: { value: "26", qualifier: "YEARS" } }];
		expect(parseStediResponse(r, "Humana", false).visitsCoveredPerYear).toBe("No limit reported");
	});

	it("prefers general (STC 30) benefits over other service types", () => {
		const r = structuredClone(activeResponse);
		r.plans![0].benefits!.coPayment = [
			{ coverageLevel: "INDIVIDUAL", amount: "2000", service: { value: "48" }, network: { indicator: "IN_NETWORK" } },
			{ coverageLevel: "INDIVIDUAL", amount: "25", service: { value: "30" }, network: { indicator: "IN_NETWORK" } },
		];
		expect(parseStediResponse(r, "Humana", false).copay).toBe("$25");
	});

	it("converts fractional coinsurance to a percentage", () => {
		const r = structuredClone(activeResponse);
		r.plans![0].benefits!.coInsurance = [{ coverageLevel: "INDIVIDUAL", percent: "0.1" }];
		expect(parseStediResponse(r, "Cigna", false).coinsurance).toBe("10%");
		r.plans![0].benefits!.coInsurance = [{ coverageLevel: "INDIVIDUAL", percent: "0" }];
		expect(parseStediResponse(r, "Cigna", false).coinsurance).toBe("0%");
	});

	it("falls back to the entered group number", () => {
		const r = structuredClone(activeResponse);
		r.planInformation = undefined;
		expect(parseStediResponse(r, "Aetna", false, "ENTERED1").groupNumber).toBe("ENTERED1");
	});

	it("Inactive when only a non-active status is returned", () => {
		const vob = parseStediResponse({ plans: [{ benefits: { statuses: [{ status: "INACTIVE" }] } }] }, "Aetna", false);
		expect(vob.coverage).toBe("Inactive");
	});

	it("Error when the payer returned errors and no coverage", () => {
		const vob = parseStediResponse({ errors: [{ code: "75", detail: "Subscriber not found" }] }, "Aetna", false);
		expect(vob.coverage).toBe("Error");
		expect(vob._errors?.[0]).toContain("Subscriber not found");
	});

	it("Unknown for an empty response", () => {
		expect(parseStediResponse({}, "Aetna", false).coverage).toBe("Unknown");
	});
});

describe("checkStediEligibility", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockReset();
		process.env.STEDI_API_KEY = "live_key";
		process.env.STEDI_PROVIDER_NPI = "1234567893";
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.STEDI_API_KEY;
		delete process.env.STEDI_PROVIDER_NPI;
	});

	const base = {
		insuranceProvider: "Aetna",
		memberId: " W123456789 ",
		firstName: "Jane",
		lastName: "Doe",
		dateOfBirth: "1990-05-17",
		groupNumber: "GRP42",
	};

	it("throws when STEDI_API_KEY is missing", async () => {
		delete process.env.STEDI_API_KEY;
		await expect(checkStediEligibility(base)).rejects.toThrow("STEDI_API_KEY");
	});

	it("sends a correct live request and returns an eligible result", async () => {
		fetchMock.mockResolvedValueOnce(mockFetchOnce(200, activeResponse));
		const out = await checkStediEligibility(base);

		expect(out.isEligible).toBe(true);
		expect(out.vob.sandbox).toBe(false);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("eligibility-check");
		expect(init.headers.Authorization).toBe("live_key");
		const body = JSON.parse(init.body);
		expect(body.payerId).toBe("60054");
		expect(body.provider.npi).toBe("1234567893");
		expect(body.subscriber.memberId).toBe("W123456789"); // trimmed
		expect(body.subscriber.dateOfBirth).toBe("1990-05-17");
		expect(body.subscriber.groupNumber).toBe("GRP42");
		expect(body.subscriber.name.person).toEqual({ firstName: "Jane", lastName: "Doe" });
	});

	it("rejects an unknown payer before calling Stedi", async () => {
		await expect(checkStediEligibility({ ...base, insuranceProvider: "Tiny Insurer Inc" })).rejects.toThrow(/Unknown insurance provider/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("requires member ID and DOB for live checks", async () => {
		await expect(checkStediEligibility({ ...base, memberId: "  " })).rejects.toThrow(/Member ID/);
		await expect(checkStediEligibility({ ...base, dateOfBirth: undefined })).rejects.toThrow(/Date of birth/);
		await expect(checkStediEligibility({ ...base, dateOfBirth: "not-a-date" })).rejects.toThrow(/Date of birth/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns not-eligible with friendly errors when the payer rejects the member", async () => {
		fetchMock.mockResolvedValueOnce(mockFetchOnce(200, { errors: [{ code: "75", detail: "Subscriber not found" }] }));
		const out = await checkStediEligibility(base);
		expect(out.isEligible).toBe(false);
		expect(out.vob.coverage).toBe("Error");
		expect(out.errors[0]).toContain("Verify member ID");
	});

	it("returns not-eligible for inactive coverage", async () => {
		fetchMock.mockResolvedValueOnce(mockFetchOnce(200, { plans: [{ benefits: { statuses: [{ status: "INACTIVE" }] } }] }));
		const out = await checkStediEligibility(base);
		expect(out.isEligible).toBe(false);
		expect(out.vob.coverage).toBe("Inactive");
	});

	it("surfaces a 4xx API error with details and does not retry", async () => {
		fetchMock.mockResolvedValueOnce(mockFetchOnce(400, { errors: [{ code: "58", detail: "bad dob" }] }));
		await expect(checkStediEligibility(base)).rejects.toThrow(/400.*date of birth/i);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("retries once on a 5xx and succeeds", async () => {
		fetchMock
			.mockResolvedValueOnce(mockFetchOnce(503, {}))
			.mockResolvedValueOnce(mockFetchOnce(200, activeResponse));
		const out = await checkStediEligibility(base);
		expect(out.isEligible).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("retries once on a network error then fails with that error", async () => {
		fetchMock.mockRejectedValue(new Error("ECONNRESET"));
		await expect(checkStediEligibility(base)).rejects.toThrow("ECONNRESET");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("maps an aborted request to a timeout message", async () => {
		const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
		fetchMock.mockRejectedValue(abort);
		await expect(checkStediEligibility(base)).rejects.toThrow(/did not respond in time/);
	});

	it("tolerates a non-JSON 200 body as an Unknown/not-eligible result", async () => {
		fetchMock.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 200 }));
		const out = await checkStediEligibility(base);
		expect(out.isEligible).toBe(false);
		expect(out.vob.coverage).toBe("Unknown");
	});

	describe("sandbox (test_ key)", () => {
		beforeEach(() => {
			process.env.STEDI_API_KEY = "test_abc";
		});

		it("substitutes the mock identity instead of real patient data", async () => {
			fetchMock.mockResolvedValueOnce(mockFetchOnce(200, activeResponse));
			const out = await checkStediEligibility({ ...base, memberId: "REAL-ID", dateOfBirth: undefined });
			expect(out.vob.sandbox).toBe(true);
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.subscriber.memberId).toBe("AETNA12345");
			expect(body.subscriber.dateOfBirth).toBe("2004-04-04");
			expect(body.subscriber.name.person).toEqual({ firstName: "Jane", lastName: "Doe" });
			expect(body.subscriber.groupNumber).toBeUndefined();
			expect(JSON.stringify(body)).not.toContain("REAL-ID");
		});

		it("rejects payers without a sandbox mock", async () => {
			await expect(checkStediEligibility({ ...base, insuranceProvider: "Molina" })).rejects.toThrow(/TEST\/sandbox/);
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
