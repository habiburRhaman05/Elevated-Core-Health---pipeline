/** Strips the backend's "Eligibility check failed: " prefix so errors read naturally in the dialog. */
export function cleanEligibilityError(message: string | undefined | null): string {
  return (message || "Eligibility check failed. Please try again.").replace(/^Eligibility check failed:\s*/i, "")
}
