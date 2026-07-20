import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#E8792E] via-[#E8792E] to-[#024d2b] relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
          <span className="text-white text-2xl font-bold tracking-tight">ECH</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          Patient Pipeline Portal
        </h1>
        <p className="text-[#F2994A] text-sm leading-relaxed mb-8">
          Track patients through every stage of the administrative workflow — from onboarding to reconciliation.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center h-10 px-6 rounded-lg bg-white text-[#E8792E] font-semibold text-sm hover:bg-[#FFF0E5] transition-colors shadow-lg"
          >
            Sign In
          </Link>
        </div>
        <p className="text-[#F2994A]/60 text-[10px] mt-8">
          Elevated Core Health &middot; Internal Operations Portal
        </p>
      </div>
    </div>
  )
}
