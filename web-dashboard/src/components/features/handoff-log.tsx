"use client"

import { useState } from "react"
import { useActivityLog } from "@/hooks/query/useActivityLog"
import { Search, Loader2 } from "lucide-react"

export function HandoffLog() {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useActivityLog({
    page,
    limit: 30,
    ...(typeFilter ? { type: typeFilter } : {}),
  })

  const logs = data?.logs || []
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#1A1B1E]">Handoff Log</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Track every action across the pipeline
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search by patient name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 focus:border-[#E8792E] transition-all"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 appearance-none cursor-pointer"
        >
          <option value="">All types</option>
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#E8792E] animate-spin" />
          </div>
        ) : logs.length > 0 ? (
          <div className="divide-y divide-[#E5E7EB]/50">
            {logs
              .filter(
                (log) =>
                  !search ||
                  log.patient?.name
                    ?.toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[#FFF0E5]/30 transition-colors"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      log.type === "auto"
                        ? "bg-[#F2994A]"
                        : "bg-[#E8792E]"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-[#E8792E]">
                        {log.author}
                      </span>
                      <span className="text-[#6B7280] text-xs">&middot;</span>
                      <span className="text-xs text-[#6B7280]">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {log.type === "auto" && (
                        <span className="text-[10px] bg-[#FFF0E5] text-[#E8792E] px-1.5 py-0.5 rounded font-medium">
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#374151] mt-0.5">
                      {log.message}
                    </p>
                    {log.patient && (
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        Patient: {log.patient.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-[#6B7280]">No activity log entries yet</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] bg-white text-[#1A1B1E] disabled:opacity-40 hover:border-[#F2994A]/40 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-[#6B7280]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E5E7EB] bg-white text-[#1A1B1E] disabled:opacity-40 hover:border-[#F2994A]/40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
