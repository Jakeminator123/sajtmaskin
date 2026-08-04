"use client";

import BudgetEstimate from "@/components/audit/BudgetEstimate";
import ImprovementsList from "@/components/audit/ImprovementsList";
import MetricsChart from "@/components/audit/MetricsChart";
import SecurityReport from "@/components/audit/SecurityReport";
import type { AuditResult } from "@/types/audit";
import { TabsContent } from "@/components/ui/tabs";
import { EmptyState, sanitizeDisplayText, renderTextList } from "./helpers";

interface AuditModalPanelsProps {
  result: AuditResult;
  hasScores: boolean;
  hasImprovements: boolean;
  hasSecurity: boolean;
  hasBudget: boolean;
  hasBusinessProfile: boolean;
  hasMarketContext: boolean;
  hasCustomerSegments: boolean;
  hasCompetitiveLandscape: boolean;
  hasAdvancedBusiness: boolean;
}

function AuditModalPanels({
  result,
  hasScores,
  hasImprovements,
  hasSecurity,
  hasBudget,
  hasBusinessProfile,
  hasMarketContext,
  hasCustomerSegments,
  hasCompetitiveLandscape,
  hasAdvancedBusiness,
}: AuditModalPanelsProps) {
  return (
    <>
                <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasScores && result.audit_scores && (
                      <MetricsChart scores={result.audit_scores as { [key: string]: number }} />
                    )}

                    {/* Strengths & Issues Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-green-400">
                            <span>✅</span> Styrkor
                          </h3>
                          <ul className="space-y-2">
                            {result.strengths.slice(0, 5).map((strength, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                                <span className="mt-0.5 text-green-400">•</span>
                                <span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.issues && result.issues.length > 0 && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-red-400">
                            <span>⚠️</span> Problem
                          </h3>
                          <ul className="space-y-2">
                            {result.issues.slice(0, 5).map((issue, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                                <span className="mt-0.5 text-red-400">•</span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Expected Outcomes */}
                    {result.expected_outcomes && result.expected_outcomes.length > 0 && (
                      <div className="rounded-xl border border-border bg-secondary/30 p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
                          <span>🎯</span> Förväntade resultat
                        </h3>
                        <ul className="grid gap-2 md:grid-cols-2">
                          {result.expected_outcomes.map((outcome, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 rounded-lg bg-secondary/30 p-2 text-sm text-foreground/90"
                            >
                              <span className="text-brand-teal">📈</span>
                              <span>{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Improvements Tab */}
                <TabsContent value="improvements" forceMount className="data-[state=inactive]:hidden">
                    {hasImprovements && result.improvements ? (
                      <ImprovementsList improvements={result.improvements} />
                    ) : (
                      <EmptyState
                        icon="✨"
                        title="Inga förbättringar"
                        description="Analysen genererade inga specifika förbättringsförslag."
                      />
                    )}
                </TabsContent>

                {/* Technical Tab */}
                <TabsContent value="technical" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasSecurity && result.security_analysis && (
                      <SecurityReport securityAnalysis={result.security_analysis} />
                    )}

                    {/* Technical Recommendations */}
                    {result.technical_recommendations &&
                      result.technical_recommendations.length > 0 && (
                        <div className="rounded-xl border border-border bg-secondary/40 p-6">
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-foreground">
                            <span className="text-brand-teal">⚙️</span> Tekniska rekommendationer
                          </h3>
                          <div className="space-y-4">
                            {result.technical_recommendations.map((rec, i) => (
                              <div key={i} className="rounded-lg border border-border bg-secondary/30 p-4">
                                <h4 className="text-brand-teal mb-2 font-medium">{rec.area}</h4>
                                <p className="mb-2 text-sm text-muted-foreground">
                                  <span className="text-muted-foreground/70">Nuläge:</span> {rec.current_state}
                                </p>
                                <p className="text-sm text-foreground/90">
                                  <span className="text-muted-foreground/70">Rekommendation:</span>{" "}
                                  {rec.recommendation}
                                </p>
                                {rec.implementation && (
                                  <pre className="mt-2 overflow-x-auto rounded-lg bg-card p-2 text-xs text-muted-foreground">
                                    {rec.implementation}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {!hasSecurity &&
                      (!result.technical_recommendations ||
                        result.technical_recommendations.length === 0) && (
                        <EmptyState
                          icon="⚙️"
                          title="Ingen teknisk data"
                          description="Analysen genererade inga tekniska detaljer."
                        />
                      )}
                  </div>
                </TabsContent>

                {/* Business/Budget Tab */}
                <TabsContent value="business" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasBudget && result.budget_estimate && (
                      <BudgetEstimate budget={result.budget_estimate} />
                    )}

                    {/* Competitor Insights */}
                    {result.competitor_insights && (
                      <div className="rounded-xl border border-border bg-secondary/40 p-6">
                        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-foreground">
                          <span className="text-brand-teal">🏆</span> Konkurrentanalys
                        </h3>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Branschstandard
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.industry_standards)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Saknade funktioner
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.missing_features)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Unika styrkor
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.unique_strengths)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasAdvancedBusiness && (
                      <div className="space-y-5 rounded-xl border border-border bg-secondary/40 p-6">
                        <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-foreground">
                          <span className="text-brand-blue">🧭</span> Affärs- & marknadsprofil
                        </h3>

                        {hasBusinessProfile && result.business_profile && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">Företagsprofil</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Bransch</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.industry)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Företagsstorlek</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.company_size)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Affärsmodell</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.business_model)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Mognadsgrad</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.maturity)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Kärnerbjudanden</p>
                                {renderTextList(result.business_profile.core_offers)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Intäktsströmmar</p>
                                {renderTextList(result.business_profile.revenue_streams)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasMarketContext && result.market_context && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">
                              Marknad & geografi
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Primär geografi</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.primary_geography)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Serviceområde</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.service_area)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Konkurrensnivå</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.competition_level)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Nyckelkonkurrenter</p>
                                {renderTextList(result.market_context.key_competitors)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Säsongsmönster</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.seasonal_patterns)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">
                                  Lokala marknadsdynamiker
                                </p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.local_market_dynamics)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCustomerSegments && result.customer_segments && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">Kundsegment</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Primär kundgrupp</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.customer_segments.primary_segment)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Sekundära kundgrupper</p>
                                {renderTextList(result.customer_segments.secondary_segments)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Kundbehov</p>
                                {renderTextList(result.customer_segments.customer_needs)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Beslutstriggers</p>
                                {renderTextList(result.customer_segments.decision_triggers)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-muted-foreground">Förtroendesignaler</p>
                                {renderTextList(result.customer_segments.trust_signals)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCompetitiveLandscape && result.competitive_landscape && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">
                              Konkurrenslandskap
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Positionering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.competitive_landscape.positioning)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Differentiering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.differentiation,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Prisposition</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.price_positioning,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Inträdesbarriärer</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.barriers_to_entry,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-muted-foreground">Möjligheter</p>
                                {renderTextList(result.competitive_landscape.opportunities)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!hasBudget && !result.competitor_insights && !hasAdvancedBusiness && (
                      <EmptyState
                        icon="💰"
                        title="Ingen affärsdata"
                        description="Analysen genererade inga budgetuppskattningar."
                      />
                    )}
                  </div>
                </TabsContent>
    </>
  );
}

export { AuditModalPanels };
