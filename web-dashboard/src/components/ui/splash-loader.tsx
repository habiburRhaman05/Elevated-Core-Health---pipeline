"use client"

import { cn } from "@/lib/utils"

interface SplashLoaderProps {
  show?: boolean
  message?: string
  subtitle?: string
}

export function SplashLoader({
  show = true,
  message = "Loading",
  subtitle = "Please wait...",
}: SplashLoaderProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[#F0F6F2]">
      {/* Animated background gradient */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#036638]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#65BD6C]/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-8">
        {/* Logo Container with Animation */}
        <div className="relative w-32 h-32 sm:w-40 sm:h-40">
          {/* Outer spinning ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#65BD6C] border-r-[#036638] animate-spin" />

          {/* Middle pulsing ring */}
          <div className="absolute inset-2 rounded-full border-2 border-[#65BD6C]/30 animate-pulse" />

          {/* Inner glowing ring */}
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#036638]/10 to-[#065040]/5 blur-xl animate-pulse" />

          {/* Logo Image */}
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Elevated Core Health"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain animate-bounce"
              style={{
                animation: "bounce 2s infinite",
              }}
            />
          </div>

          {/* Floating particles effect */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/2 w-1 h-1 bg-[#65BD6C] rounded-full animate-ping" />
            <div className="absolute bottom-0 right-1/4 w-1 h-1 bg-[#036638] rounded-full animate-ping delay-500" />
            <div className="absolute top-1/2 right-0 w-1 h-1 bg-[#65BD6C] rounded-full animate-ping delay-1000" />
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center space-y-3">
          {/* <h2 className="text-xl sm:text-2xl font-bold text-white">{message}</h2> */}
          <p className="text-sm text-[#9CA3AF]">{subtitle}</p>

          {/* Loading dots animation */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <span className="w-2 h-2 bg-[#65BD6C] rounded-full animate-bounce" />
            <span
              className="w-2 h-2 bg-[#65BD6C] rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="w-2 h-2 bg-[#65BD6C] rounded-full animate-bounce"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>
      </div>

      {/* Optional footer text */}
      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-[#6B7280]">
          Elevated <span className="text-[#65BD6C] font-semibold">Core Health</span>
        </p>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }

        .delay-1000 {
          animation-delay: 1s;
        }

        .delay-500 {
          animation-delay: 0.5s;
        }

        .animate-pulse {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  )
}
