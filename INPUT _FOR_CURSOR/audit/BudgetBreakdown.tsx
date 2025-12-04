'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface BudgetBreakdownProps {
  budget: {
    low?: number;
    high?: number;
    immediate_fixes?: { low: number; high: number };
    full_optimization?: { low: number; high: number };
    ongoing_monthly?: { low: number; high: number };
    initial_development?: { low: number; high: number };
    annual_maintenance?: { low: number; high: number };
    marketing_launch?: { low: number; high: number };
    currency: string;
    payment_structure?: string;
  };
}

export default function BudgetBreakdown({ budget }: BudgetBreakdownProps) {
  const [selectedView, setSelectedView] = useState<'breakdown' | 'timeline'>('breakdown');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: budget.currency || 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRange = (low: number, high: number) => {
    return `${formatCurrency(low)} - ${formatCurrency(high)}`;
  };

  // Calculate totals
  const calculateTotal = (type: 'low' | 'high') => {
    let total = 0;
    if (budget.immediate_fixes) total += budget.immediate_fixes[type];
    if (budget.full_optimization) total += budget.full_optimization[type];
    if (budget.initial_development) total += budget.initial_development[type];
    if (budget.marketing_launch) total += budget.marketing_launch[type];
    return total;
  };

  const budgetItems = [
    {
      label: 'Omedelbara åtgärder',
      data: budget.immediate_fixes,
      color: 'red',
      icon: '🚨',
      description: 'Kritiska fixar som behövs omgående'
    },
    {
      label: 'Full optimering',
      data: budget.full_optimization,
      color: 'blue',
      icon: '🚀',
      description: 'Omfattande förbättringar för optimal prestanda'
    },
    {
      label: 'Initial utveckling',
      data: budget.initial_development,
      color: 'green',
      icon: '💻',
      description: 'Utveckling av nya funktioner och design'
    },
    {
      label: 'Marknadsföring lansering',
      data: budget.marketing_launch,
      color: 'purple',
      icon: '📢',
      description: 'Kampanjer och marknadsföring vid lansering'
    },
    {
      label: 'Månatlig drift',
      data: budget.ongoing_monthly,
      color: 'yellow',
      icon: '📅',
      description: 'Löpande kostnader per månad'
    },
    {
      label: 'Årligt underhåll',
      data: budget.annual_maintenance,
      color: 'orange',
      icon: '🔧',
      description: 'Årliga underhållskostnader'
    }
  ].filter(item => item.data);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="text-3xl">💰</span>
          Budgetuppskattning
        </h3>

        <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
          <button
            onClick={() => setSelectedView('breakdown')}
            className={`px-4 py-2 rounded transition-all ${
              selectedView === 'breakdown'
                ? 'bg-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Uppdelning
          </button>
          <button
            onClick={() => setSelectedView('timeline')}
            className={`px-4 py-2 rounded transition-all ${
              selectedView === 'timeline'
                ? 'bg-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Tidslinje
          </button>
        </div>
      </div>

      {selectedView === 'breakdown' && (
        <>
          {/* Budget Items */}
          <div className="space-y-4 mb-8">
            {budgetItems.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`p-6 rounded-xl border bg-${item.color}-500/10 border-${item.color}-500/20 hover:border-${item.color}-500/30 transition-all`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{item.icon}</span>
                    <div>
                      <h4 className="text-lg font-semibold text-white">{item.label}</h4>
                      <p className="text-sm text-gray-400">{item.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold text-${item.color}-400`}>
                      {item.data && formatRange(item.data.low, item.data.high)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Total Summary */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="p-6 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-xl border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-bold text-white">Total investering</h4>
              <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-400">
                {formatRange(calculateTotal('low'), calculateTotal('high'))}
              </p>
            </div>
            {budget.payment_structure && (
              <p className="text-gray-400 text-sm">
                Betalningsstruktur: {budget.payment_structure}
              </p>
            )}
          </motion.div>
        </>
      )}

      {selectedView === 'timeline' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-white/20" />

            {/* Timeline items */}
            {[
              { month: 'Månad 1', items: ['Omedelbara åtgärder', 'Projektstart'], cost: budget.immediate_fixes },
              { month: 'Månad 2-3', items: ['Utveckling', 'Design'], cost: budget.initial_development },
              { month: 'Månad 4', items: ['Testning', 'Optimering'], cost: budget.full_optimization },
              { month: 'Lansering', items: ['Marknadsföring', 'Kampanjer'], cost: budget.marketing_launch },
              { month: 'Löpande', items: ['Drift', 'Underhåll'], cost: budget.ongoing_monthly },
            ].map((phase, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative flex gap-6"
              >
                <div className="relative z-10 w-16 h-16 bg-accent rounded-full flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 bg-white/5 rounded-xl p-6 border border-white/10">
                  <h5 className="text-lg font-semibold text-white mb-2">{phase.month}</h5>
                  <ul className="text-gray-400 text-sm mb-3">
                    {phase.items.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                  {phase.cost && (
                    <p className="text-lg font-semibold text-blue-400">
                      {formatRange(phase.cost.low, phase.cost.high)}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ROI Projection */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-white/10"
      >
        <h4 className="text-lg font-semibold text-white mb-3">ROI-projektion</h4>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-400 mb-1">Förväntad ökning av konvertering</p>
            <p className="text-2xl font-bold text-green-400">+25-40%</p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Återbetalningstid</p>
            <p className="text-2xl font-bold text-blue-400">6-12 månader</p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Årlig ROI</p>
            <p className="text-2xl font-bold text-purple-400">150-300%</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
