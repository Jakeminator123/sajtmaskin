"use client";

import { motion } from "framer-motion";
import type { BudgetEstimate as BudgetEstimateType } from "@/types/audit";

interface BudgetEstimateProps {
  budget: BudgetEstimateType;
}

function sanitizePaymentStructure(value?: string): string {
  if (!value) return "";
  let cleaned = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export default function BudgetEstimate({ budget }: BudgetEstimateProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: budget.currency || "SEK",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const rangeColorClasses: Record<string, { text: string; gradient: string }> = {
    teal: { text: "text-brand-teal", gradient: "from-brand-teal/50 to-brand-teal" },
    amber: {
      text: "text-brand-amber",
      gradient: "from-brand-amber/50 to-brand-amber",
    },
    blue: { text: "text-brand-blue", gradient: "from-brand-blue/50 to-brand-blue" },
    purple: {
      text: "text-brand-blue",
      gradient: "from-brand-blue/50 to-brand-blue",
    },
    warm: { text: "text-brand-warm", gradient: "from-brand-warm/50 to-brand-warm" },
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

  const paymentStructure = sanitizePaymentStructure(budget.payment_structure);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-gray-800 bg-black/50 p-6"
    >
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
        <span className="text-brand-teal">💰</span> Budgetuppskattning
      </h2>

      <div className="space-y-4">
        {ranges.map((range, index) => (
          <motion.div
            key={range.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="border border-gray-800 bg-black/30 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="font-medium text-white">{range.label}</h4>
                <p className="text-xs text-gray-500">{range.description}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-lg font-bold ${
                    rangeColorClasses[range.color]?.text || rangeColorClasses.teal.text
                  }`}
                >
                  {range.data?.low ? formatCurrency(range.data.low) : "–"}
                  {range.data?.high && range.data.low !== range.data.high && (
                    <span className="text-gray-400"> – {formatCurrency(range.data.high)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Visual bar */}
            {range.data?.high && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden bg-gray-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                    className={`h-full bg-gradient-to-r ${
                      rangeColorClasses[range.color]?.gradient || rangeColorClasses.teal.gradient
                    }`}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {paymentStructure && (
        <div className="bg-brand-teal/10 border-brand-teal/30 mt-4 border p-3 text-sm">
          <p className="text-brand-teal wrap-break-word whitespace-pre-wrap">
            💡 <span className="font-medium">Rekommenderad betalningsplan:</span>{" "}
            <span className="text-brand-teal/80">{paymentStructure}</span>
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        * Uppskattningar baserade på svenska marknadssnitt. Faktiska kostnader kan variera.
      </p>
    </motion.div>
  );
}
