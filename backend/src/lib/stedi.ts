import { logger } from "@/utils/logger";

const STEDI_BASE_URL = "https://healthcare.us.stedi.com/2026-06-01/eligibility-check";

/**
 * Production payer IDs — use these once a LIVE (non-"test_"-prefixed) Stedi
 * API key is configured. Extend as needed:
 * https://www.stedi.com/healthcare/network
 */
const PAYER_ID_MAP: Record<string, string> = {
	"aetna": "60054",
	"cigna": "62308",
	"united healthcare": "87726",
	"uhc": "87726",
	"humana": "61101",
	"kaiser permanente": "91051",
	"tricare": "99726",
	"medicare": "CMS",
	"medicaid": "SKMED",
	"anthem": "00735",
	"blue cross blue shield": "00735",
	"bcbs": "00735",
	"carefirst": "CAREF",
	"centene": "68069",
	"molina": "20934",
	"wellcare": "WC001",
	"oscar health": "OSCAR",
	"ambetter": "AMB01",
};

/**
 * Stedi test API keys ("test_..." prefix) only accept a small, fixed set of
 * mock payer/member/name/DOB combinations — "Stedi returns an error if you
 * try to send production data with a test API key" (any other DOB/name/
 * memberId for these payers errors out). See
 * https://www.stedi.com/docs/healthcare/api-reference/mock-requests-eligibility-checks
 *
 * When a test key is active, a VA's real patient details are NOT sent —
 * instead we substitute the fixed mock identity for the chosen payer so the
 * sandbox call succeeds, and flag the result as a sandbox/demo check.
 */
const TEST_PAYER_MOCKS: Record<string, { payerId: string; memberId: string; firstName: string; lastName: string; dateOfBirth: string }> = {
	"aetna": { payerId: "60054", memberId: "AETNA12345", firstName: "Jane", lastName: "Doe", dateOfBirth: "2004-04-04" },
	"anthem": { payerId: "040", memberId: "CGMBCBSCA123", firstName: "John", lastName: "Doe", dateOfBirth: "1975-01-01" },
	"blue cross blue shield": { payerId: "040", memberId: "CGMBCBSCA123", firstName: "John", lastName: "Doe", dateOfBirth: "1975-01-01" },
	"bcbs": { payerId: "040", memberId: "CGMBCBSCA123", firstName: "John", lastName: "Doe", dateOfBirth: "1975-01-01" },
	"cigna": { payerId: "62308", memberId: "23456789100", firstName: "James", lastName: "Jones", dateOfBirth: "1991-02-02" },
	"oscar health": { payerId: "OSCAR", memberId: "OSCAR123456", firstName: "Jane", lastName: "Doe", dateOfBirth: "2001-01-01" },
	"united healthcare": { payerId: "87726", memberId: "UHC123456", firstName: "Jane", lastName: "Doe", dateOfBirth: "1971-01-01" },
	"uhc": { payerId: "87726", memberId: "UHC123456", firstName: "Jane", lastName: "Doe", dateOfBirth: "1971-01-01" },
	"humana": { payerId: "61101", memberId: "HUMANA123", firstName: "Jane", lastName: "Doe", dateOfBirth: "1975-05-05" },
	"kaiser permanente": { payerId: "KSRCN", memberId: "KAISER123456", firstName: "Jane", lastName: "Doe", dateOfBirth: "2002-02-02" },
	"medicare": { payerId: "CMS", memberId: "CMS12345678", firstName: "Jane", lastName: "Doe", dateOfBirth: "1955-05-05" },
};

export const SUPPORTED_TEST_PAYERS = Object.keys(TEST_PAYER_MOCKS);

function isTestApiKey(apiKey: string): boolean {
	return apiKey.startsWith("test_");
}

export function resolvePayerId(insuranceProvider: string | null | undefined): string | null {
	if (!insuranceProvider) return null;
	const key = insuranceProvider.trim().toLowerCase();
	if (PAYER_ID_MAP[key]) return PAYER_ID_MAP[key];
	for (const [name, id] of Object.entries(PAYER_ID_MAP)) {
		if (key.includes(name) || name.includes(key)) return id;
	}
	if (/^[A-Z0-9]{2,10}$/i.test(insuranceProvider.trim())) return insuranceProvider.trim();
	return null;
}

function resolveTestMock(insuranceProvider: string) {
	const key = insuranceProvider.trim().toLowerCase();
	if (TEST_PAYER_MOCKS[key]) return TEST_PAYER_MOCKS[key];
	for (const [name, mock] of Object.entries(TEST_PAYER_MOCKS)) {
		if (key.includes(name) || name.includes(key)) return mock;
	}
	return null;
}

interface StediPersonName {
	firstName: string;
	lastName: string;
}

interface StediEligibilityRequest {
	payerId: string;
	provider: {
		name: { organization: string };
		npi: string;
	};
	subscriber: {
		memberId: string;
		groupNumber?: string;
		dateOfBirth?: string; // YYYY-MM-DD
		name: { person: StediPersonName };
	};
	encounter: {
		services: Array<{ value: string; system: "STC" }>;
	};
}

interface StediBenefitService {
	value?: string;
	definition?: string;
	system?: string;
}

interface StediNetwork {
	indicator?: "IN_NETWORK" | "OUT_OF_NETWORK" | "IN_AND_OUT_OF_NETWORK" | string;
}

interface StediBenefitStatus {
	status?: string;
	coverageLevel?: string;
	insuranceType?: string;
	planName?: string;
	groupNumber?: string;
}

interface StediBenefitAmount {
	coverageLevel?: string;
	amount?: string;
	insuranceType?: string;
	timePeriod?: string; // e.g. "CALENDAR_YEAR", "CONTRACT", "REMAINING"
	authOrCertIndicator?: boolean | string;
	network?: StediNetwork;
	service?: StediBenefitService;
}

interface StediBenefitPercent {
	coverageLevel?: string;
	percent?: string;
	network?: StediNetwork;
	service?: StediBenefitService;
}

interface StediPlan {
	benefits?: {
		statuses?: StediBenefitStatus[];
		coPayment?: StediBenefitAmount[];
		coInsurance?: StediBenefitPercent[];
		deductible?: StediBenefitAmount[];
		outOfPocket?: StediBenefitAmount[];
		limitations?: unknown[];
		nonCovered?: unknown[];
		benefitDisclaimer?: string;
		primaryCareProvider?: unknown;
	};
}

export interface StediEligibilityResponse {
	id?: string;
	eligibilitySearchId?: string;
	payerId?: string;
	subscriber?: {
		memberId?: string;
		dateOfBirth?: string;
		gender?: string;
		name?: { person?: StediPersonName };
	};
	plans?: StediPlan[];
	errors?: Array<{ title?: string; detail?: string; message?: string; description?: string; possibleResolutions?: string; code?: string; field?: string }>;
	planInformation?: { groupNumber?: string };
}

export interface VobSnapshot {
	coverage: string;
	payer: string;
	memberId: string;
	groupNumber: string;
	copay: string;
	coinsurance: string;
	deductible: string;
	deductibleMet: string;
	outOfPocketMax: string;
	authorizationRequired: boolean;
	visitsCoveredPerYear: string;
	checkDate: string;
	planType?: string;
	sandbox?: boolean;
	_raw?: StediEligibilityResponse;
	_errors?: string[];
}

function formatAmount(amount: string | undefined): string {
	if (amount === undefined || amount === null || amount === "") return "N/A";
	const num = Number.parseFloat(amount);
	if (Number.isNaN(num)) return amount;
	return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(pct: string | undefined): string {
	if (pct === undefined || pct === null || pct === "") return "N/A";
	const num = Number.parseFloat(pct);
	if (Number.isNaN(num)) return pct;
	// Stedi reports coinsurance as a fraction (0.1 = 10%).
	return `${Math.round(num * 10000) / 100}%`;
}

function pickByCoverageLevel<T extends { coverageLevel?: string; network?: StediNetwork; service?: StediBenefitService }>(
	allItems: T[] | undefined,
): T | undefined {
	if (!allItems || allItems.length === 0) return undefined;
	// Payers return benefits per service type; prefer the general "Health Benefit Plan Coverage" (STC 30) ones.
	// Fall back to office-visit (98) / mental-health (MH) rows, never to unrelated ones (e.g. inpatient hospital).
	let items: T[] = [];
	for (const code of ["30", "98", "MH"]) {
		items = allItems.filter((i) => i.service?.value === code);
		if (items.length > 0) break;
	}
	if (items.length === 0) items = allItems.some((i) => i.service?.value) ? [] : allItems;
	if (items.length === 0) return undefined;
	return (
		items.find((i) => i.coverageLevel === "INDIVIDUAL" && i.network?.indicator !== "OUT_OF_NETWORK") ??
		items.find((i) => i.network?.indicator !== "OUT_OF_NETWORK") ??
		items[0]
	);
}

const isRemaining = (i: { timePeriod?: string }) => i.timePeriod === "REMAINING";

/** Plan totals only, so the annual amount is never confused with the remaining balance. */
const totalsOnly = <T extends { timePeriod?: string }>(items: T[] | undefined): T[] | undefined =>
	items?.filter((i) => !isRemaining(i));

/** "Met" = annual deductible - remaining deductible, floored at 0. */
function computeDeductibleMet(deductibles: StediBenefitAmount[] | undefined): string {
	if (!deductibles) return "N/A";
	const total = pickByCoverageLevel(totalsOnly(deductibles));
	const remaining = pickByCoverageLevel(deductibles.filter(isRemaining));
	const t = Number.parseFloat(total?.amount ?? "");
	const r = Number.parseFloat(remaining?.amount ?? "");
	if (Number.isNaN(t) || Number.isNaN(r)) return "N/A";
	return formatAmount(String(Math.max(0, t - r)));
}

function detectAuthorizationRequired(benefits: StediPlan["benefits"]): boolean {
	if (!benefits) return false;
	const all: Array<{ authOrCertIndicator?: boolean | string }> = [
		...(benefits.coPayment ?? []),
		...(benefits.deductible ?? []),
		...(benefits.outOfPocket ?? []),
	];
	return all.some((b) => b.authOrCertIndicator === true || b.authOrCertIndicator === "Y" || b.authOrCertIndicator === "true");
}

function summarizeVisitLimits(benefits: StediPlan["benefits"]): string {
	const limitations = (benefits?.limitations ?? []) as Array<{
		quantity?: { value?: string; qualifier?: string };
		timePeriod?: string;
	}>;
	// Only visit-count limits (payers also report unrelated ones like "max dependent age: 26 YEARS").
	const visits = limitations.find((l) => l.quantity?.value && /visit/i.test(l.quantity.qualifier ?? ""));
	if (visits?.quantity?.value) {
		const period = visits.timePeriod ? ` per ${visits.timePeriod.toLowerCase().replace(/_/g, " ")}` : "";
		return `${visits.quantity.value} visits${period}`;
	}
	return "No limit reported";
}

/** X12 AAA reject codes -> messages a VA can act on. */
const AAA_MESSAGES: Record<string, string> = {
	"15": "Required information is missing or invalid. Check the member ID, name and date of birth.",
	"33": "The payer reports an input error. Check the member ID, name and date of birth.",
	"42": "The payer is temporarily unable to respond. Please try again in a few minutes.",
	"43": "The provider NPI is not valid for this payer.",
	"44": "The provider name is not recognised by this payer.",
	"45": "The provider is not enrolled with this payer for eligibility checks.",
	"51": "The provider is not on file with this payer.",
	"58": "The subscriber's date of birth is missing or invalid.",
	"64": "Member ID not found with this payer. Verify the member ID on the insurance card.",
	"65": "The patient name is missing or invalid.",
	"67": "Patient not found with this payer. Verify name, date of birth and member ID.",
	"71": "The date of birth does not match the payer's records.",
	"72": "The member ID is invalid or missing.",
	"73": "The subscriber name is invalid or missing.",
	"75": "Subscriber not found with this payer. Verify member ID and name.",
	"79": "The payer ID is not valid for this payer.",
	"80": "No response received from the payer. Please retry shortly.",
	T4: "The payer is unable to respond right now. Please retry.",
};

export function describeStediError(e: {
	code?: string;
	title?: string;
	detail?: string;
	message?: string;
	description?: string;
}): string {
	const friendly = e.code ? AAA_MESSAGES[e.code] : undefined;
	const raw = e.detail ?? e.message ?? e.description ?? e.title;
	if (friendly) return raw && raw !== friendly ? `${friendly} (${raw})` : friendly;
	return raw ?? "Unknown payer error";
}

export function parseStediResponse(
	response: StediEligibilityResponse,
	insuranceProvider: string,
	sandbox: boolean,
	fallbackGroupNumber = "",
): VobSnapshot {
	const errors: string[] = (response.errors ?? []).map(describeStediError);

	const plan = response.plans?.[0];
	const benefits = plan?.benefits;

	const statuses = benefits?.statuses ?? [];
	const activeStatus = statuses.find((s) => s.status === "ACTIVE_COVERAGE");
	const coverage = activeStatus ? "Active" : errors.length > 0 ? "Error" : statuses[0]?.status ? "Inactive" : "Unknown";
	const planType = activeStatus?.insuranceType?.replace(/_/g, " ") ?? statuses[0]?.insuranceType?.replace(/_/g, " ");

	const copay = pickByCoverageLevel(totalsOnly(benefits?.coPayment));
	const coinsurance = pickByCoverageLevel(benefits?.coInsurance);
	const deductible = pickByCoverageLevel(totalsOnly(benefits?.deductible));
	const outOfPocket = pickByCoverageLevel(totalsOnly(benefits?.outOfPocket));

	return {
		coverage,
		payer: insuranceProvider,
		memberId: response.subscriber?.memberId ?? "",
		groupNumber: response.planInformation?.groupNumber ?? activeStatus?.groupNumber ?? fallbackGroupNumber,
		copay: formatAmount(copay?.amount),
		coinsurance: formatPercent(coinsurance?.percent),
		deductible: formatAmount(deductible?.amount),
		deductibleMet: computeDeductibleMet(benefits?.deductible),
		outOfPocketMax: formatAmount(outOfPocket?.amount),
		authorizationRequired: detectAuthorizationRequired(benefits),
		visitsCoveredPerYear: summarizeVisitLimits(benefits),
		checkDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
		planType,
		sandbox,
		_raw: response,
		_errors: errors.length > 0 ? errors : undefined,
	};
}

const REQUEST_TIMEOUT_MS = 20_000;

/** POST with a timeout; retries once on network failure or a 5xx. */
async function postWithRetry(apiKey: string, body: unknown): Promise<Response> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const res = await fetch(STEDI_BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: apiKey },
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (res.status >= 500 && attempt === 0) {
				lastErr = new Error(`Stedi API returned ${res.status}`);
				continue;
			}
			return res;
		} catch (err) {
			lastErr = err;
		} finally {
			clearTimeout(timer);
		}
	}
	if (lastErr instanceof Error && lastErr.name === "AbortError") {
		throw new Error("Stedi did not respond in time. Please try again.");
	}
	throw lastErr instanceof Error ? lastErr : new Error("Could not reach Stedi.");
}

export async function checkStediEligibility(params: {
	insuranceProvider: string;
	memberId: string;
	firstName: string;
	lastName: string;
	dateOfBirth?: string;
	groupNumber?: string;
}): Promise<{ vob: VobSnapshot; isEligible: boolean; errors: string[] }> {
	const apiKey = process.env.STEDI_API_KEY;
	const providerNpi = process.env.STEDI_PROVIDER_NPI || "1999999984";
	const providerName = process.env.STEDI_PROVIDER_NAME || "Elevated Core Health";

	if (!apiKey) {
		throw new Error("STEDI_API_KEY is not configured");
	}

	const sandbox = isTestApiKey(apiKey);

	let payerId: string | null;
	let subscriber: { memberId: string; firstName: string; lastName: string; dateOfBirth?: string };

	if (sandbox) {
		// Test keys only accept Stedi's fixed mock identities per payer — the
		// VA's real entered details are not usable here, so substitute the
		// documented mock combination for the chosen payer.
		const mock = resolveTestMock(params.insuranceProvider);
		if (!mock) {
			throw new Error(
				`This Stedi key is a TEST/sandbox key, which only supports a fixed list of payers: ${SUPPORTED_TEST_PAYERS.join(", ")}. "${params.insuranceProvider}" is not in that list.`,
			);
		}
		payerId = mock.payerId;
		subscriber = { memberId: mock.memberId, firstName: mock.firstName, lastName: mock.lastName, dateOfBirth: mock.dateOfBirth };
	} else {
		payerId = resolvePayerId(params.insuranceProvider);
		if (!payerId) {
			throw new Error(
				`Unknown insurance provider: "${params.insuranceProvider}". Please enter a valid payer ID or a recognized insurance name.`,
			);
		}

		if (!params.memberId?.trim()) {
			throw new Error("Member ID is required for a live eligibility check.");
		}

		let formattedDob: string | undefined;
		if (params.dateOfBirth) {
			const d = new Date(params.dateOfBirth);
			if (!Number.isNaN(d.getTime())) {
				formattedDob = d.toISOString().slice(0, 10); // YYYY-MM-DD
			}
		}
		// Payers match on DOB; without it a live check is a near-certain reject.
		if (!formattedDob) {
			throw new Error("Date of birth is required for a live eligibility check. Enter the patient's date of birth.");
		}

		subscriber = {
			memberId: params.memberId.trim(),
			firstName: params.firstName,
			lastName: params.lastName || "Unknown",
			dateOfBirth: formattedDob,
		};
	}

	const requestBody: StediEligibilityRequest = {
		payerId,
		provider: {
			name: { organization: providerName },
			npi: providerNpi,
		},
		subscriber: {
			memberId: subscriber.memberId,
			...(params.groupNumber && !sandbox ? { groupNumber: params.groupNumber } : {}),
			...(subscriber.dateOfBirth ? { dateOfBirth: subscriber.dateOfBirth } : {}),
			name: { person: { firstName: subscriber.firstName, lastName: subscriber.lastName } },
		},
		encounter: {
			services: [{ value: "30", system: "STC" }],
		},
	};

	logger.info(
		{ payerId, memberIdLast4: subscriber.memberId.slice(-4), sandbox },
		"Stedi eligibility check — sending request",
	);

	const res = await postWithRetry(apiKey, requestBody);

	const rawText = await res.text();
	let response: StediEligibilityResponse;
	try {
		response = rawText ? JSON.parse(rawText) : {};
	} catch {
		response = {};
	}

	if (!res.ok) {
		logger.error({ status: res.status, body: rawText.slice(0, 500) }, "Stedi eligibility check — API error");
		const detail =
			response.errors?.map(describeStediError).join("; ") || rawText.slice(0, 200);
		throw new Error(`Stedi API returned ${res.status}: ${detail}`);
	}

	logger.info(
		{ id: response.id, planCount: response.plans?.length ?? 0 },
		"Stedi eligibility check — response received",
	);

	const vob = parseStediResponse(response, params.insuranceProvider, sandbox, params.groupNumber ?? "");
	const isEligible = vob.coverage === "Active";
	const errors = vob._errors ?? [];

	return { vob, isEligible, errors };
}
