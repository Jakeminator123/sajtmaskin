'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import MetricsChart from './MetricsChart';
import ImprovementMatrix from './ImprovementMatrix';
import SecurityReport from './SecurityReport';
import CompetitorInsights from './CompetitorInsights';
import TechnicalRecommendations from './TechnicalRecommendations';
import BudgetBreakdown from './BudgetBreakdown';
import RoadmapView from './RoadmapView';
import WebsiteTypeCard from './WebsiteTypeCard';
import ContentStrategy from './ContentStrategy';
import DesignDirection from './DesignDirection';
import CompetitorBenchmark from './CompetitorBenchmark';
import SuccessMetrics from './SuccessMetrics';
import type { AuditResult } from '@/types/audit';

interface DashboardProps {
  result: AuditResult;
  onDownloadPDF?: () => void;
  onDownloadJSON?: () => void;
  isGeneratingPDF?: boolean;
  onCopyLink?: () => void;
}

type ViewMode = 'overview' | 'technical' | 'business' | 'roadmap';

export default function Dashboard({ result, onDownloadPDF, onDownloadJSON, isGeneratingPDF = false, onCopyLink }: DashboardProps) {
  const [activeView, setActiveView] = useState<ViewMode>('overview');

  const viewModes = [
    { id: 'overview', label: 'Översikt', icon: '📊' },
    { id: 'technical', label: 'Teknisk', icon: '⚙️' },
    { id: 'business', label: 'Affär', icon: '💼' },
    { id: 'roadmap', label: 'Roadmap', icon: '🗺️' },
  ];

  const hasAuditScores = result.audit_scores && Object.keys(result.audit_scores).length > 0;
  const hasImprovements = result.improvements && result.improvements.length > 0;
  const hasPriorityMatrix = result.priority_matrix;
  const hasSecurityAnalysis = result.security_analysis;
  const hasCompetitorInsights = result.competitor_insights;
  const hasTechnicalRecs = result.technical_recommendations && result.technical_recommendations.length > 0;
  const hasBudget = result.budget_estimate;
  const hasRoadmap = result.implementation_roadmap;
  const hasWebsiteType = Boolean(result.website_type_recommendation);
  const hasContentStrategy = Boolean(result.content_strategy);
  const hasDesignDirection = Boolean(result.design_direction);
  const hasBenchmarking = Boolean(result.competitor_benchmarking);
  const hasSuccessMetrics = Boolean(result.success_metrics);
  const hasTechnicalContent = Boolean(hasSecurityAnalysis || hasTechnicalRecs || result.technical_architecture);
  const hasBusinessContent = Boolean(
    hasCompetitorInsights ||
      hasBudget ||
      result.target_audience_analysis ||
      hasContentStrategy ||
      hasDesignDirection ||
      hasBenchmarking ||
      hasSuccessMetrics
  );

  return (
    <div className="space-y-8">
      {/* Header with Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <motion.h1 
            className="text-4xl md:text-5xl lg:text-6xl font-black mb-3"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
              {result.audit_type === 'website_audit' ? 'Analysresultat' : 'Rekommendationer'}
            </span>
          </motion.h1>
          {result.company && (
            <motion.p 
              className="text-xl md:text-2xl text-gray-300 font-semibold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {result.company}
            </motion.p>
          )}
          {result.domain && (
            <motion.p 
              className="text-lg text-gray-400 mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {result.domain}
            </motion.p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <motion.button
            whileHover={!isGeneratingPDF ? { scale: 1.05 } : {}}
            whileTap={!isGeneratingPDF ? { scale: 0.95 } : {}}
            onClick={onDownloadPDF}
            disabled={isGeneratingPDF}
            className={`px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all flex items-center gap-2 backdrop-blur-xl ${
              isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Ladda ner som PDF"
          >
            {isGeneratingPDF ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="inline-block"
                >
                  ⏳
                </motion.span>
                Genererar...
              </>
            ) : (
              <>
                <span>📄</span> PDF
              </>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onDownloadJSON}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all flex items-center gap-2 backdrop-blur-xl"
            title="Ladda ner som JSON"
          >
            <span>💾</span> JSON
          </motion.button>
          {onCopyLink && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCopyLink}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all flex items-center gap-2 backdrop-blur-xl"
              title="Kopiera länk till resultat"
            >
              <span>🔗</span> Kopiera länk
            </motion.button>
          )}
        </div>
      </div>

      {/* View Mode Selector */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl backdrop-blur-xl">
        {viewModes.map((mode) => (
          <motion.button
            key={mode.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView(mode.id as ViewMode)}
            className={`flex-1 px-4 py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeView === mode.id
                ? 'bg-accent text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>{mode.icon}</span>
            <span className="hidden md:inline">{mode.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Cost Information */}
      {result.cost && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Analys kostnad</span>
            <div className="text-right">
              <span className="text-2xl font-bold text-white">
                {typeof result.cost.sek === 'number' ? result.cost.sek.toFixed(2) : '0.00'} SEK
              </span>
              <span className="text-sm text-gray-500 ml-2">
                ({typeof result.cost.tokens === 'number' ? result.cost.tokens : 0} tokens)
              </span>
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* Overview View */}
        {activeView === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {/* Metrics Overview */}
            {hasAuditScores && result.audit_scores && (
              <MetricsChart scores={result.audit_scores as { [key: string]: number }} />
            )}

            {hasWebsiteType && result.website_type_recommendation && (
              <WebsiteTypeCard recommendation={result.website_type_recommendation} />
            )}

            {/* Strengths and Issues */}
            <div className="grid md:grid-cols-2 gap-6">
              {result.strengths && result.strengths.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="backdrop-blur-xl bg-green-500/10 border border-green-500/20 rounded-2xl p-6"
                >
                  <h3 className="text-2xl md:text-3xl font-black text-green-400 mb-6 flex items-center gap-3">
                    <motion.span
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      ✅
                    </motion.span>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-500">
                      Styrkor
                    </span>
                  </h3>
                  <ul className="space-y-2">
                    {result.strengths.slice(0, 5).map((strength: string, index: number) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="text-gray-300 flex items-start gap-2"
                      >
                        <span className="text-green-400 mt-1">•</span>
                        <span>{strength}</span>
                      </motion.li>
                    ))}
                  </ul>
                  {result.strengths.length > 5 && (
                    <p className="text-sm text-gray-500 mt-4">
                      +{result.strengths.length - 5} fler styrkor
                    </p>
                  )}
                </motion.div>
              )}

              {result.issues && result.issues.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 rounded-2xl p-6"
                >
                  <h3 className="text-2xl md:text-3xl font-black text-red-400 mb-6 flex items-center gap-3">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      ⚠️
                    </motion.span>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-500">
                      Problem att åtgärda
                    </span>
                  </h3>
                  <ul className="space-y-2">
                    {result.issues.slice(0, 5).map((issue: string, index: number) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="text-gray-300 flex items-start gap-2"
                      >
                        <span className="text-red-400 mt-1">•</span>
                        <span>{issue}</span>
                      </motion.li>
                    ))}
                  </ul>
                  {result.issues.length > 5 && (
                    <p className="text-sm text-gray-500 mt-4">
                      +{result.issues.length - 5} fler problem
                    </p>
                  )}
                </motion.div>
              )}
            </div>

            {/* Priority Matrix */}
            {hasPriorityMatrix && hasImprovements && result.improvements && result.priority_matrix && (
              <ImprovementMatrix
                improvements={result.improvements}
                priorityMatrix={result.priority_matrix as {
                  quick_wins: string[]
                  major_projects: string[]
                  fill_ins: string[]
                  thankless_tasks?: string[]
                }}
              />
            )}

            {/* Expected Outcomes */}
            {result.expected_outcomes && result.expected_outcomes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6"
              >
                <h3 className="text-2xl md:text-3xl font-black text-white mb-6 flex items-center gap-3">
                  <motion.span
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    🎯
                  </motion.span>
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                    Förväntade resultat
                  </span>
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {result.expected_outcomes.map((outcome: string, index: number) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-3 p-4 bg-white/5 rounded-xl"
                    >
                      <span className="text-2xl">📈</span>
                      <span className="text-gray-300">{outcome}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Technical View */}
        {activeView === 'technical' && (
          <motion.div
            key="technical"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {hasSecurityAnalysis && result.security_analysis && (
              <SecurityReport securityAnalysis={result.security_analysis as {
                https_status: string
                headers_analysis: string
                cookie_policy: string
                vulnerabilities: string[]
              }} />
            )}

            {hasTechnicalRecs && result.technical_recommendations && (
              <TechnicalRecommendations recommendations={result.technical_recommendations} />
            )}

            {result.technical_architecture && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6"
              >
                <h3 className="text-2xl md:text-3xl font-black mb-6">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
                    Teknisk arkitektur
                  </span>
                </h3>
                <div className="space-y-4">
                  {result.technical_architecture.recommended_stack && (
                    <div>
                      <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="text-blue-400">⚙️</span>
                        <span>Rekommenderad stack</span>
                      </h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        {Object.entries(result.technical_architecture.recommended_stack).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                            <span className="text-gray-400 capitalize">{key}:</span>
                            <span className="text-white font-medium">{value as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.technical_architecture.integrations && result.technical_architecture.integrations.length > 0 && (
                    <div>
                      <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="text-purple-400">🔌</span>
                        <span>Integrationer</span>
                      </h4>
                      <ul className="grid sm:grid-cols-2 gap-2 text-gray-300 text-sm">
                        {result.technical_architecture.integrations.map((integration: string) => (
                          <li key={integration} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                            <span className="text-accent text-lg">🔌</span>
                            {integration}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.technical_architecture.security_measures && result.technical_architecture.security_measures.length > 0 && (
                    <div>
                      <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="text-green-400">🔒</span>
                        <span>Säkerhetsåtgärder</span>
                      </h4>
                      <ul className="space-y-2 text-gray-300 text-sm">
                        {result.technical_architecture.security_measures.map((measure: string) => (
                          <li key={measure} className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">•</span>
                            {measure}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {!hasTechnicalContent && (
              <EmptyState
                icon="🧰"
                title="Ingen teknisk data"
                description="AI-analysen hittade inga tekniska detaljer. Kör om analysen med en mer avancerad modell eller säkerställ att underlag finns."
              />
            )}
          </motion.div>
        )}

        {/* Business View */}
        {activeView === 'business' && (
          <motion.div
            key="business"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {hasCompetitorInsights && result.competitor_insights && (
              <CompetitorInsights insights={result.competitor_insights} />
            )}

            {hasBudget && result.budget_estimate && (
              <BudgetBreakdown budget={result.budget_estimate} />
            )}

            {result.target_audience_analysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6"
              >
                <h3 className="text-2xl md:text-3xl font-black mb-6">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-rose-500">
                    Målgruppsanalys
                  </span>
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {Object.entries(result.target_audience_analysis).map(([key, value]) => (
                    <div key={key}>
                      <h4 className="text-lg font-bold text-white mb-3 capitalize">
                        {key.replace('_', ' ')}
                      </h4>
                      <p className="text-gray-400">{value as string}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {(hasContentStrategy || hasDesignDirection) && (
              <div className="grid md:grid-cols-2 gap-6">
                {hasContentStrategy && result.content_strategy && (
                  <ContentStrategy strategy={result.content_strategy} />
                )}
                {hasDesignDirection && result.design_direction && (
                  <DesignDirection direction={result.design_direction} />
                )}
              </div>
            )}

            {hasBenchmarking && result.competitor_benchmarking && (
              <CompetitorBenchmark benchmarking={result.competitor_benchmarking} />
            )}

            {hasSuccessMetrics && result.success_metrics && (
              <SuccessMetrics metrics={result.success_metrics} />
            )}

            {!hasBusinessContent && (
              <EmptyState
                icon="💼"
                title="Ingen affärsdata"
                description="Vi kunde inte extrahera affärsinsikter för denna analys. Försök med fler inputs eller en ny körning."
              />
            )}
          </motion.div>
        )}

        {/* Roadmap View */}
        {activeView === 'roadmap' && (
          <motion.div
            key="roadmap"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {hasRoadmap && result.implementation_roadmap ? (
              <RoadmapView roadmap={result.implementation_roadmap} />
            ) : (
              <EmptyState
                icon="🗺️"
                title="Ingen roadmap"
                description="Ingen implementation-roadmap genererades i resultatet. Lägg till mer detaljer i briefen eller kör om analysen."
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 text-center"
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </motion.div>
  );
}
