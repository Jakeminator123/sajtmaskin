"use client";

import { motion } from "framer-motion";
import type { BudgetEstimate as BudgetEstimateType } from "@/types/audit";

interface BudgetEstimateProps {
  budget: BudgetEstimateType;
}

export default function BudgetEstimate({ budget }: BudgetEstimateProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: budget.currency || "SEK",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const ranges = [
    {
      label: "Snabba åtgärder",
      description: "Kritiska förbättringar",
      data: budget.immediate_fixes,
      color: "teal",
    },
    {
      label: "Full optimering",
      description: "Komplett förbättringspaket",
      data: budget.full_optimization,
      color: "blue",
    },
    {
      label: "Löpande underhåll",
      description: "Per månad",
      data: budget.ongoing_monthly,
      color: "purple",
    },
  ].filter((r) => r.data && (r.data.low || r.data.high));

  // Fallback for simple low/high format
  if (ranges.length === 0 && (budget.low || budget.high)) {
    ranges.push({
      label: "Uppskattad budget",
      description: "Total kostnad",
      data: { low: budget.low || 0, high: budget.high || 0 },
      color: "teal",
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-gray-800 p-6"
    >
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="text-teal-400">💰</span> Budgetuppskattning
      </h2>

      <div className="space-y-4">
        {ranges.map((range, index) => (
          <motion.div
            key={range.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 bg-black/30 border border-gray-800"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="font-medium text-white">{range.label}</h4>
                <p className="text-xs text-gray-500">{range.description}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold text-${range.color}-400`}>
                  {range.data?.low ? formatCurrency(range.data.low) : "–"}
                  {range.data?.high && range.data.low !== range.data.high && (
                    <span className="text-gray-400">
                      {" "}
                      – {formatCurrency(range.data.high)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Visual bar */}
            {range.data?.high && (
              <div className="mt-3">
                <div className="w-full h-2 bg-gray-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                    className={`h-full bg-gradient-to-r from-${range.color}-500/50 to-${range.color}-400`}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {budget.payment_structure && (
        <div className="mt-4 p-3 bg-teal-500/10 border border-teal-500/30 text-sm">
          <p className="text-teal-400">
            💡{" "}
            <span className="font-medium">Rekommenderad betalningsplan:</span>{" "}
            <span className="text-teal-300">{budget.payment_structure}</span>
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        * Uppskattningar baserade på svenska marknadssnitt. Faktiska kostnader
        kan variera.
      </p>
    </motion.div>
  );
}
