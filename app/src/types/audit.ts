/**
 * TypeScript types for Site Audit feature
 * Based on sajtstudio's audit implementation
 */

// Improvement suggestion with impact and effort assessment
export interface Improvement {
  item: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  why?: string;
  how?: string;
  estimated_time?: string;
  technologies?: string[];
  code_example?: string;
  category?: "UX" | "Tech" | "Content" | "Marketing" | "Security";
}

// Technical recommendation with implementation details
export interface TechnicalRecommendation {
  area: string;
  current_state: string;
  recommendation: string;
  implementation?: string;
}

// Security analysis results
export interface SecurityAnalysis {
  https_status: string;
  headers_analysis: string;
  cookie_policy: string;
  vulnerabilities?: string[];
}

// Budget estimate breakdown
export interface BudgetEstimate {
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
}

// Competitor insights
export interface CompetitorInsights {
  industry_standards: string;
  missing_features: string;
  unique_strengths: string;
}

// Competitor benchmarking
export interface CompetitorBenchmarking {
  industry_leaders?: string[];
  common_features?: string[];
  differentiation_opportunities?: string[];
}

// Target audience analysis
export interface TargetAudienceAnalysis {
  demographics: string;
  behaviors: string;
  pain_points: string;
  expectations: string;
}

// Content strategy
export interface ContentStrategy {
  key_pages?: string[];
  content_types?: string[];
  seo_foundation?: string;
  conversion_paths?: string[];
}

// Design direction
export interface DesignDirection {
  style: string;
  color_psychology: string;
  ui_patterns?: string[];
  accessibility_level: string;
}

// Technical architecture
export interface TechnicalArchitecture {
  recommended_stack?: {
    frontend?: string;
    backend?: string;
    cms?: string;
    hosting?: string;
    [key: string]: string | undefined;
  };
  integrations?: string[];
  security_measures?: string[];
}

// Implementation roadmap phase
export interface RoadmapPhase {
  duration?: string;
  deliverables?: string[];
  activities?: string[];
}

// Implementation roadmap
export interface ImplementationRoadmap {
  phase_1?: RoadmapPhase;
  phase_2?: RoadmapPhase;
  phase_3?: RoadmapPhase;
  launch?: RoadmapPhase;
  [key: string]: RoadmapPhase | undefined;
}

// Success metrics
export interface SuccessMetrics {
  kpis?: string[];
  tracking_setup?: string;
  review_schedule?: string;
}

// Priority matrix for improvements
export interface PriorityMatrix {
  quick_wins?: string[];
  major_projects?: string[];
  fill_ins?: string[];
  thankless_tasks?: string[];
}

// Audit scores (0-100 for each category)
export interface AuditScores {
  seo?: number;
  technical_seo?: number;
  ux?: number;
  content?: number;
  performance?: number;
  accessibility?: number;
  security?: number;
  mobile?: number;
  [key: string]: number | undefined;
}

// Cost information
export interface AuditCost {
  tokens: number;
  sek: number;
  usd: number;
}

// Main audit result type
export interface AuditResult {
  // Type of audit
  audit_type: "website_audit" | "recommendation";

  // Basic info
  company?: string;
  domain?: string;
  timestamp?: string;

  // Scores (for website audit)
  audit_scores?: AuditScores;

  // Findings
  strengths?: string[];
  issues?: string[];
  improvements?: Improvement[];

  // Budget and outcomes
  budget_estimate?: BudgetEstimate;
  expected_outcomes?: string[];

  // For recommendation mode
  website_type_recommendation?: string;

  // Technical analysis
  security_analysis?: SecurityAnalysis;
  technical_recommendations?: TechnicalRecommendation[];
  technical_architecture?: TechnicalArchitecture;

  // Business analysis
  competitor_insights?: CompetitorInsights;
  competitor_benchmarking?: CompetitorBenchmarking;
  target_audience_analysis?: TargetAudienceAnalysis;

  // Strategy
  content_strategy?: ContentStrategy;
  design_direction?: DesignDirection;
  priority_matrix?: PriorityMatrix;

  // Planning
  implementation_roadmap?: ImplementationRoadmap;
  success_metrics?: SuccessMetrics;

  // Cost tracking
  cost: AuditCost;
}

// Website content scraped from URL
export interface WebsiteContent {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  images: number;
  links: {
    internal: number;
    external: number;
  };
  meta: {
    keywords?: string;
    author?: string;
    viewport?: string;
    robots?: string;
  };
  hasSSL: boolean;
  responseTime: number;
  wordCount: number;
  textPreview: string;
}

// API request body
export interface AuditRequest {
  url: string;
}

// API response
export interface AuditResponse {
  success: boolean;
  result?: AuditResult;
  error?: string;
}
