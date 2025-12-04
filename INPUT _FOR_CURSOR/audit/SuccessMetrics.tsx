'use client';

import { motion } from 'framer-motion';

interface SuccessMetricsProps {
  metrics: {
    kpis: string[];
    tracking_setup: string;
    review_schedule: string;
  };
}

export default function SuccessMetrics({ metrics }: SuccessMetricsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">📈</span>
        <h3 className="text-xl font-bold text-white">Framgångsmått</h3>
      </div>
      {metrics.kpis && metrics.kpis.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Prioriterade KPI:er</p>
          <div className="flex flex-wrap gap-2">
            {metrics.kpis.map((kpi) => (
              <span
                key={kpi}
                className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-200 text-sm"
              >
                {kpi}
              </span>
            ))}
          </div>
        </div>
      )}
      {metrics.tracking_setup && (
        <div className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Spårningsupplägg</p>
          <p className="text-gray-200">{metrics.tracking_setup}</p>
        </div>
      )}
      {metrics.review_schedule && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Uppföljningsplan</p>
          <p className="text-gray-200">{metrics.review_schedule}</p>
        </div>
      )}
    </motion.div>
  );
}

