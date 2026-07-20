"use client"

import { useState } from "react"
import {
  useAdminChecklist,
  useCreateChecklistItem,
  useDeleteChecklistItem,
} from "@/hooks/query/useAdmin"
import { STAGE_ORDER, STAGE_LABELS } from "@/types"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useForm } from "react-hook-form"

export default function AdminChecklistPage() {
  const { data: items, isLoading } = useAdminChecklist()
  const createItem = useCreateChecklistItem()
  const deleteItem = useDeleteChecklistItem()

  const [modalOpen, setModalOpen] = useState(false)

  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: { stage: "onboarding", label: "", sortOrder: 0 },
  })

  const openCreate = () => {
    reset({ stage: "onboarding", label: "", sortOrder: 0 })
    setModalOpen(true)
  }

  const onSubmit = async (data: any) => {
    await createItem.mutateAsync({
      stage: data.stage,
      label: data.label,
      sortOrder: data.sortOrder ? parseInt(data.sortOrder) : undefined,
    })
    setModalOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#E8792E] animate-spin" />
      </div>
    )
  }

  const itemsByStage =
    items?.reduce(
      (acc, item) => {
        if (!acc[item.stage]) acc[item.stage] = []
        acc[item.stage].push(item)
        return acc
      },
      {} as Record<string, typeof items>,
    ) || {}

  return (
    <div className="space-y-6  max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1B1E]">Checklist Manager</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Configure checklist items per pipeline stage
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {STAGE_ORDER.map((stage) => {
        const stageItems = itemsByStage[stage] || []
        return (
          <div key={stage} className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-bold text-[#E8792E] mb-3">{STAGE_LABELS[stage]}</h3>
            {stageItems.length > 0 ? (
              <div className="space-y-1.5">
                {stageItems
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#FFF0E5]/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded border border-[#E5E7EB]" />
                        <span className="text-sm text-[#374151]">{item.label}</span>
                        {item.isDefault && (
                          <span className="text-[10px] bg-[#FFF0E5] text-[#E8792E] px-1.5 py-0.5 rounded font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteItem.mutate(item.id)}
                        className="p-1 rounded hover:bg-red-50 text-[#6B7280] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-[#6B7280] italic">No items for this stage</p>
            )}
          </div>
        )
      })}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1A1B1E]">
              Add Checklist Item
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Stage</label>
              <select
                {...register("stage")}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 bg-white"
              >
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Label</label>
              <input
                {...register("label", { required: "Label is required" })}
                placeholder="e.g. Verify insurance eligibility"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Sort Order</label>
              <input
                type="number"
                {...register("sortOrder")}
                placeholder="0"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createItem.isPending}
                className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs"
              >
                {createItem.isPending ? "Adding..." : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
