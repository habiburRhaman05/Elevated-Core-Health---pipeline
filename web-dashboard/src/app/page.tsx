"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Activity,
  Flag,
  Bell,
  Users,
  CheckCircle2,
  Clock,
  Shield,
  FileText,
  UserCheck,
  Layers,
  Mail,
  Fingerprint,
  Server,
  Lock,
} from "lucide-react"

function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setIsInView(true); observer.unobserve(el) }
      },
      { threshold: 0.15, ...options },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [options])
  return { ref, isInView }
}

function useCountUp(target: number, isActive: boolean, duration = 2000) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!isActive) return
    let start = 0
    const increment = target / (duration / 16)
    const timer = setInterval(() => {
      start += increment
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target, isActive, duration])
  return count
}

function ScrollReveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isInView } = useInView()
  return (
    <div
      ref={ref}
      className={`transition-all duration-900 ease-out ${isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDuration: "900ms", transitionDelay: `${delay}ms`, transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      {children}
    </div>
  )
}

function StaggerChildren({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, isInView } = useInView()
  return (
    <div ref={ref} className={className}>
      {isInView ? children : <div className="invisible">{children}</div>}
    </div>
  )
}

const SECTION_LABEL = "text-[11px] font-semibold text-[#E8792E] uppercase tracking-[0.18em]"

// ─── Navbar ───
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-[#0F0F0F]/80 backdrop-blur-xl border-b border-white/5" : "bg-transparent"}`}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E8792E] to-[#F2994A] flex items-center justify-center shadow-lg shadow-[#E8792E]/20 group-hover:shadow-[#E8792E]/40 transition-shadow duration-300">
              <span className="text-white text-sm font-bold tracking-tight">ECH</span>
            </div>
            <span className="text-sm font-semibold text-white/80 hidden sm:block">Patient Pipeline Portal</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/login" className="group relative text-sm font-medium text-white/60 hover:text-white transition-colors duration-300">
              Sign In
              <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-gradient-to-r from-[#E8792E] to-[#F2994A] group-hover:w-full transition-all duration-300" />
            </Link>
            <Link
              href="/login"
              className="group relative inline-flex items-center gap-1.5 h-9 sm:h-10 px-5 sm:px-6 rounded-full bg-white text-[#E8792E] text-sm font-semibold overflow-hidden transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFF0E5] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <span className="relative">Enter Portal</span>
              <ArrowRight className="relative w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ───
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#0F0F0F]">
      {/* Mesh gradient layers */}
      <div className="absolute inset-0 opacity-60">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-[#E8792E]/20 blur-[120px] animate-mesh" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-[#F2994A]/15 blur-[120px] animate-mesh-2" />
        <div className="absolute top-1/3 right-1/4 w-1/3 h-1/3 rounded-full bg-[#FFF0E5]/8 blur-[100px] animate-mesh" style={{ animationDelay: "-10s" }} />
      </div>

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: "48px 48px" }} />

      {/* Top-right decorative element */}
              <div className="absolute top-20 right-10 w-32 h-32 border border-white/5 rounded-full animate-float-slow max-lg:hidden" />
              <div className="absolute top-32 right-24 w-20 h-20 border border-white/5 rounded-full animate-float max-lg:hidden" style={{ animationDelay: "2s" }} />

      <div className="relative mx-auto max-w-7xl px-6 pt-28 sm:pt-32 pb-20 w-full">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          {/* Text column */}
          <div className="lg:col-span-5 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 w-fit backdrop-blur-sm opacity-0 animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-medium text-white/60 tracking-wide">Internal Operations Portal</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight opacity-0 animate-slide-up-strong animate-delay-100">
                <span className="text-white">Track.</span><br />
                <span className="text-white">Manage.</span><br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F2994A] via-[#E8792E] to-[#F2994A]">Reconcile.</span>
              </h1>
              <p className="text-base sm:text-lg text-white/50 max-w-md leading-relaxed opacity-0 animate-slide-up animate-delay-300">
                A purpose-built patient pipeline portal for Elevated Core Health.
                Track every administrative stage — from booking to reconciliation —
                across two VA shifts without missing a beat.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 opacity-0 animate-slide-up animate-delay-400">
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2 h-11 sm:h-12 px-6 sm:px-8 rounded-full bg-gradient-to-r from-[#E8792E] to-[#F2994A] text-white font-semibold text-sm overflow-hidden transition-all duration-300 hover:shadow-[0_0_30px_rgba(232,121,46,0.4)] hover:scale-105 active:scale-95"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: "inset 0 0 20px rgba(255,255,255,0.1)" }} />
                <span className="relative">Enter the Portal</span>
                <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </Link>
              <Link
                href="/login"
                className="group relative inline-flex items-center h-11 sm:h-12 px-6 sm:px-8 rounded-full border border-white/10 text-white/50 font-medium text-sm overflow-hidden transition-all duration-300 hover:bg-white/5 hover:border-white/20 hover:text-white/80 active:scale-95"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative">Watch Overview</span>
                <ArrowRight className="relative w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform duration-300" />
              </Link>
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap items-center gap-5 text-xs text-white/30 opacity-0 animate-fade-in animate-delay-600">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {["#E8792E", "#F2994A", "#FFF0E5"].map((c, i) => (
                    <div key={i} className="w-5 h-5 rounded-full border-2 border-[#0F0F0F]" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-white/40">Trusted by 3</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-green-500/60" />
                <span className="text-white/40">HIPAA-ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-white/30" />
                <span className="text-white/40">Encrypted</span>
              </div>
            </div>
          </div>

          {/* Mockup column */}
          <div className="lg:col-span-7 opacity-0 animate-slide-up-strong animate-delay-200">
            <div className="relative group">
              {/* Glow behind */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#E8792E]/10 to-[#F2994A]/5 rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

              {/* Browser frame */}
              <div className="relative rounded-2xl overflow-hidden bg-[#1A1B1E] border border-white/10 shadow-2xl shadow-black/40 group-hover:border-white/20 transition-all duration-500">
                {/* Mac traffic dots */}
                <div className="flex items-center gap-1.5 px-4 py-3 bg-[#0F0F0F]/80 border-b border-white/5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                  <span className="text-[10px] text-white/20 ml-2 font-mono">pipeline.elevatedcore.com</span>
                </div>

                {/* Mockup content */}
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Status bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#E8792E] to-[#F2994A] flex items-center justify-center">
                        <Activity className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Pipeline Board</p>
                        <p className="text-[10px] text-white/30">Live overview</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-medium text-green-400">All caught up</span>
                    </div>
                  </div>

                  {/* Pipeline stages */}
                  <div className="grid gap-1.5">
                    {[
                      { label: "Onboarding", count: 3, pct: 25, color: "from-[#F2994A] to-[#E8792E]" },
                      { label: "Visit Complete", count: 5, pct: 42, color: "from-[#E8792E] to-[#D4691F]" },
                      { label: "Post-Visit Docs", count: 2, pct: 17, color: "from-[#F2994A] to-[#D4691F]" },
                      { label: "Chart Signed", count: 2, pct: 17, color: "from-[#E8792E] to-[#C45A14]" },
                      { label: "Sent to Billing", count: 4, pct: 33, color: "from-[#F2994A] to-[#E8792E]" },
                      { label: "Payment Posted", count: 1, pct: 8, color: "from-[#E8792E] to-[#B84E08]" },
                      { label: "Reconciled", count: 12, pct: 100, color: "from-green-500 to-emerald-500" },
                    ].map((s) => {
                      const maxBar = 12
                      const barPct = (s.count / maxBar) * 100
                      return (
                        <div key={s.label} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                          <span className="text-[11px] text-white/50 w-24 shrink-0">{s.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${s.color} transition-all duration-1000`}
                              style={{ width: `${Math.max(barPct, 4)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-white/70 w-5 text-right">{s.count}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer badges */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-3 text-[10px] text-white/30">
                      <div className="flex items-center gap-1">
                        <Flag className="w-3 h-3" />
                        <span>2 flagged</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>1 stale</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
                      <span className="text-[10px] text-green-400/60">Updated 2m ago</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 rounded-xl bg-gradient-to-br from-[#E8792E] to-[#F2994A] px-3 sm:px-4 py-2 shadow-xl animate-float-slow hidden sm:block">
                <p className="text-[9px] text-white/70 uppercase tracking-wider">Status</p>
                <p className="text-sm font-bold text-white">All Caught Up</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-scroll">
        <span className="text-[10px] text-white/20 uppercase tracking-widest">Scroll</span>
        <div className="w-px h-6 bg-gradient-to-b from-white/20 to-transparent" />
      </div>
    </section>
  )
}

// ─── How It Works ───
const STEPS = [
  {
    number: "01",
    title: "Intake Automatically",
    desc: "New patient bookings from Klarity and ZocDoc are pushed via webhook. The portal creates a patient card at the Onboarding stage and notifies your VAs instantly.",
    icon: Mail,
  },
  {
    number: "02",
    title: "Track Through Every Stage",
    desc: "VAs move patients through 7 checklist-gated stages. Forward moves require all items complete; backward moves are always free. Stale cards are auto-flagged after 48 hours.",
    icon: Layers,
  },
  {
    number: "03",
    title: "Close with Confidence",
    desc: "When payment is reconciled against the billed amount, the patient is closed out. Full activity log provides an audit trail for every action taken.",
    icon: CheckCircle2,
  },
]

function HowItWorksSection() {
  return (
    <section className="relative py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto mb-14 sm:mb-20">
          <span className={SECTION_LABEL}>How It Works</span>
          <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-[#0F0F0F] mt-4 mb-4 leading-tight">
            Three Moves, End to End
          </h2>
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
            From booking email to reconciled closeout — the portal maps your exact workflow
            so nothing falls through the cracks between shifts.
          </p>
        </ScrollReveal>

        <StaggerChildren>
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="group relative">
                  <div className={`relative p-6 sm:p-8 rounded-2xl bg-white border border-[#E5E7EB] transition-all duration-500 hover:border-[#E8792E]/20 hover:shadow-xl hover:shadow-[#E8792E]/5 ${i === 1 ? "md:translate-y-6" : ""}`}
                    style={{
                      animation: `slide-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                      animationDelay: `${i * 150}ms`,
                      opacity: 0,
                    }}
                  >
                    {/* Hover gradient */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FFF0E5]/0 to-[#FBE7B2]/0 group-hover:from-[#FFF0E5]/30 group-hover:to-[#FBE7B2]/20 transition-all duration-500 pointer-events-none" />

                    <div className="relative">
                      <div className="flex items-center justify-between mb-5">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFF0E5] to-[#FBE7B2] group-hover:from-[#E8792E] group-hover:to-[#F2994A] transition-all duration-500 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-[#E8792E] group-hover:text-white transition-colors duration-500" />
                        </div>
                        <span className="text-2xl sm:text-3xl font-bold text-[#E8792E]/10 group-hover:text-[#E8792E]/20 transition-colors duration-500 tabular-nums">{step.number}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-[#0F0F0F] mb-2">{step.title}</h3>
                      <p className="text-sm text-[#6B7280] leading-relaxed">{step.desc}</p>
                    </div>

                    {/* Connector line */}
                    {i < STEPS.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-px bg-gradient-to-r from-[#E5E7EB] to-transparent" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </StaggerChildren>
      </div>
    </section>
  )
}

// ─── Features (alternating split) ───
const FEATURES = [
  {
    title: "Visual Pipeline Board",
    desc: "A real-time kanban board shows every patient and their current stage. Drag-and-drop with server-side checklist validation — forward moves are gated, backward moves are always free. No more spreadsheets or sticky notes.",
    tag: "Pipeline",
    icon: Layers,
    stats: [
      { label: "Stages", value: "7" },
      { label: "Checklist Items", value: "Per stage" },
      { label: "Stale Detection", value: "48h" },
    ],
  },
  {
    title: "Flag & Escalate",
    desc: "Any VA can flag a patient for Donna with a required text reason. The flag stays visible until the provider clears it with feedback. Automated email notifications ensure nothing sits waiting.",
    tag: "Communication",
    icon: Flag,
    stats: [
      { label: "Flag Clearance", value: "Admin only" },
      { label: "Email Alerts", value: "Automatic" },
      { label: "Audit Trail", value: "Full log" },
    ],
  },
  {
    title: "VA Handoff System",
    desc: "Built for two remote VAs on opposite shifts. Time-based auto-assignment routes patients by appointment hour. Activity log records every action so the morning VA picks up exactly where the evening VA left off.",
    tag: "Workflow",
    icon: Users,
    stats: [
      { label: "AM VA", value: "Jude" },
      { label: "PM VA", value: "Amanda" },
      { label: "Handoff", value: "Seamless" },
    ],
  },
]

function FeatureCard({ feature, index }: { feature: typeof FEATURES[number]; index: number }) {
  const Icon = feature.icon
  return (
    <ScrollReveal delay={index * 100}>
      <div className="group grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
        {/* Text side */}
        <div className={`space-y-5 ${index % 2 === 1 ? "md:order-2" : ""}`}>
          <span className={SECTION_LABEL}>{feature.tag}</span>
          <h3 className="text-2xl sm:text-3xl font-bold text-[#0F0F0F] leading-tight">{feature.title}</h3>
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">{feature.desc}</p>

          <div className="flex flex-wrap gap-4 pt-2">
            {feature.stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFF0E5]/50 border border-[#FBE7B2]/50">
                <span className="text-[11px] text-[#6B7280]">{s.label}</span>
                <span className="text-[11px] font-bold text-[#E8792E]">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Visual side */}
        <div className={`${index % 2 === 1 ? "md:order-1" : ""}`}>
          <div className="relative rounded-2xl bg-gradient-to-br from-[#FFF0E5]/40 to-[#FBE7B2]/20 border border-[#E5E7EB] p-6 sm:p-8 group-hover:border-[#E8792E]/10 group-hover:shadow-lg transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E8792E] to-[#F2994A] flex items-center justify-center shadow-lg shadow-[#E8792E]/20 mb-5">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-[#E5E7EB]/50">
                  <div className={`w-2 h-2 rounded-full ${row === 1 ? "bg-[#E8792E]" : row === 2 ? "bg-[#F2994A]" : "bg-green-500"}`} />
                  <div className="flex-1 space-y-1">
                    <div className={`h-2 rounded-full bg-[#E5E7EB] ${row === 1 ? "w-3/4" : row === 2 ? "w-1/2" : "w-2/3"}`} />
                    <div className={`h-1.5 rounded-full bg-[#F0F2F5] ${row === 1 ? "w-full" : row === 2 ? "w-2/3" : "w-1/2"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ScrollReveal>
  )
}

function FeaturesSection() {
  return (
    <section className="relative py-20 sm:py-28 bg-[#FFF0E5]/20">
      <div className="mx-auto max-w-7xl px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto mb-14 sm:mb-20">
          <span className={SECTION_LABEL}>Features</span>
          <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-[#0F0F0F] mt-4 mb-4 leading-tight">
            Everything You Actually Need
          </h2>
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
            No clinical data. No billing engine. Just a clean, secure operations tool
            purpose-built for Donna, Jude, and Amanda.
          </p>
        </ScrollReveal>

        <div className="space-y-16 sm:space-y-24">
          {FEATURES.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Built for Your Team ───
const PERSONAS = [
  {
    name: "Donna Rhodes",
    role: "Provider & Admin",
    initials: "DR",
    quote: "I need to see the full picture at a glance — what's been done, what's waiting, and what needs my attention — without logging into three different systems.",
    focus: ["Oversight", "Flag resolution", "Analytics"],
    color: "from-[#E8792E] to-[#F2994A]",
  },
  {
    name: "Jude",
    role: "Morning VA",
    initials: "J",
    quote: "When I start my shift, I want to see exactly where Amanda left off. No digging through emails — just open the board and pick up the next task.",
    focus: ["AM patients", "Checklist completion", "Handoff notes"],
    color: "from-[#F2994A] to-[#E8792E]",
  },
  {
    name: "Amanda",
    role: "Evening VA",
    initials: "A",
    quote: "I need to know which patients need follow-up before end of day and a clean way to hand off anything I couldn't finish to Jude for the morning.",
    focus: ["PM patients", "Flagging issues", "Close-out prep"],
    color: "from-[#FFF0E5] to-[#FBE7B2]",
  },
]

function TeamSection() {
  return (
    <section className="relative py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto mb-14 sm:mb-20">
          <span className={SECTION_LABEL}>Built for Your Team</span>
          <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-[#0F0F0F] mt-4 mb-4 leading-tight">
            Designed Around Three People
          </h2>
          <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
            Not a generic tool. Every feature is shaped by how Donna, Jude, and Amanda
            actually work — their shifts, their responsibilities, their handoff.
          </p>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
          {PERSONAS.map((persona, i) => (
            <ScrollReveal key={persona.name} delay={i * 100}>
              <div className="group relative p-6 sm:p-8 rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#E8792E]/20 transition-all duration-500 hover:shadow-xl hover:shadow-[#E8792E]/5">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FFF0E5]/0 to-[#FBE7B2]/0 group-hover:from-[#FFF0E5]/20 group-hover:to-[#FBE7B2]/10 transition-all duration-500 pointer-events-none" />

                <div className="relative">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${persona.color} flex items-center justify-center mb-5 shadow-lg ${i < 2 ? "shadow-[#E8792E]/20" : "shadow-black/5"} group-hover:scale-105 transition-transform duration-500`}>
                    <span className="text-white text-lg font-bold">{persona.initials}</span>
                  </div>

                  <div className="mb-4">
                    <h3 className="text-base font-bold text-[#0F0F0F]">{persona.name}</h3>
                    <p className="text-xs text-[#E8792E] font-medium">{persona.role}</p>
                  </div>

                  <blockquote className="text-sm text-[#6B7280] leading-relaxed mb-5 italic">
                    &ldquo;{persona.quote}&rdquo;
                  </blockquote>

                  <div className="flex flex-wrap gap-2">
                    {persona.focus.map((f) => (
                      <span key={f} className="text-[10px] font-medium text-[#E8792E]/70 bg-[#FFF0E5]/60 px-2.5 py-1 rounded-full border border-[#FBE7B2]/50">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Trust Bar ───
const STATS = [
  { value: 7, suffix: "", label: "Pipeline Stages", sub: "Onboarding to reconciled" },
  { value: 3, suffix: "", label: "Team Members", sub: "Admin + 2 VAs" },
  { value: 48, suffix: "h", label: "Stale Detection", sub: "Auto-flagged threshold" },
  { value: 100, suffix: "%", label: "Checklist Gated", sub: "No skipped stages" },
]

const BADGES = [
  { icon: Shield, label: "BAA Ready", desc: "HIPAA business associate agreement" },
  { icon: Lock, label: "Encryption at Rest", desc: "AES-256 encrypted database" },
  { icon: Server, label: "Encryption in Transit", desc: "TLS 1.3 for all API traffic" },
  { icon: Fingerprint, label: "Access Control", desc: "Role-based, 3 users only" },
  { icon: FileText, label: "No Clinical Data", desc: "Operational status only" },
]

function StatCard({ value, suffix, label, sub, isActive, delay }: { value: number; suffix: string; label: string; sub: string; isActive: boolean; delay: number }) {
  const count = useCountUp(value, isActive)
  return (
    <div
      className="text-center p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-700"
      style={{
        opacity: isActive ? 1 : 0,
        transform: isActive ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F2994A] to-[#E8792E] tabular-nums mb-1">
        {count}{suffix}
      </div>
      <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
      <p className="text-xs text-white/40">{sub}</p>
    </div>
  )
}

function TrustSection() {
  const { ref, isInView } = useInView()

  return (
    <section className="relative py-20 sm:py-28 bg-[#0F0F0F] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: "40px 40px" }} />
      <div className="absolute inset-0">
        <div className="absolute bottom-0 left-1/3 w-96 h-96 rounded-full bg-[#E8792E]/5 blur-[100px]" />
        <div className="absolute top-0 right-1/4 w-64 h-64 rounded-full bg-[#F2994A]/5 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto mb-14 sm:mb-20">
          <span className="text-[11px] font-semibold text-[#F2994A] uppercase tracking-[0.18em]">Built Different</span>
          <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-white mt-4 mb-4 leading-tight">
            Security & Simplicity
          </h2>
          <p className="text-sm sm:text-base text-white/40 leading-relaxed">
            Healthcare operations require trust. Every decision — from hosting to data modeling —
            is made with HIPAA and your team&apos;s workflow in mind.
          </p>
        </ScrollReveal>

        {/* Stats */}
        <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-12 sm:mb-16">
          {STATS.map((s, i) => (
            <StatCard key={s.label} {...s} isActive={isInView} delay={i * 120} />
          ))}
        </div>

        {/* Badges row */}
        <ScrollReveal delay={200}>
          <div className="flex flex-wrap justify-center gap-3">
            {BADGES.map((badge) => {
              const Icon = badge.icon
              return (
                <div key={badge.label} className="group flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300">
                  <Icon className="w-4 h-4 text-white/30 group-hover:text-[#F2994A] transition-colors duration-300" />
                  <div>
                    <p className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors duration-300">{badge.label}</p>
                    <p className="text-[10px] text-white/30">{badge.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

// ─── Final CTA ───
function CTASection() {
  return (
    <section className="relative py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <ScrollReveal>
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0F0F0F] via-[#1A0E06] to-[#0F0F0F] p-10 sm:p-16 text-center overflow-hidden">
            {/* Inner glow */}
            <div className="absolute inset-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full bg-[#E8792E]/8 blur-[100px]" />
            </div>
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: "40px 40px" }} />

            <div className="relative">
              <span className="text-[11px] font-semibold text-[#F2994A] uppercase tracking-[0.18em]">Get Started</span>
              <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-white mt-4 mb-4 leading-tight max-w-2xl mx-auto">
                Ready to Streamline Your Pipeline?
              </h2>
              <p className="text-sm sm:text-base text-white/40 max-w-lg mx-auto mb-8 leading-relaxed">
                Secure, focused, and built for how your practice actually works.
                Sign in to access your patient pipeline board.
              </p>
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2 h-12 sm:h-13 px-7 sm:px-9 rounded-full bg-gradient-to-r from-[#E8792E] to-[#F2994A] text-white font-semibold text-sm overflow-hidden transition-all duration-300 hover:shadow-[0_0_35px_rgba(232,121,46,0.45)] hover:scale-105 active:scale-95"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: "inset 0 0 25px rgba(255,255,255,0.1)" }} />
                <span className="relative">Sign In to Portal</span>
                <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform duration-300 group-hover:scale-110" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

// ─── Footer ───
function Footer() {
  return (
    <footer className="bg-[#0F0F0F] border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E8792E] to-[#F2994A] flex items-center justify-center shadow-lg shadow-[#E8792E]/20">
              <span className="text-white text-xs font-bold">ECH</span>
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-white/60">Elevated Core Health</p>
              <p className="text-[10px] text-white/20">Patient Pipeline Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-5 sm:gap-7">
            <Link href="/login" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Privacy</Link>
            <Link href="/login" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/login" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Contact</Link>
            <span className="text-[11px] text-white/15">&copy; 2026</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ───
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <TeamSection />
      <TrustSection />
      <CTASection />
      <Footer />
    </div>
  )
}
