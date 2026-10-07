import { describe, expect, it } from "vitest"
import { cleanEligibilityError } from "@/lib/eligibility"

describe("cleanEligibilityError", () => {
  it("strips the backend prefix", () => {
    expect(cleanEligibilityError("Eligibility check failed: Member ID not found")).toBe("Member ID not found")
  })
  it("leaves other messages untouched", () => {
    expect(cleanEligibilityError("Date of birth is required")).toBe("Date of birth is required")
  })
  it("falls back to a generic message", () => {
    expect(cleanEligibilityError(undefined)).toMatch(/failed/i)
    expect(cleanEligibilityError("")).toMatch(/try again/i)
  })
})
