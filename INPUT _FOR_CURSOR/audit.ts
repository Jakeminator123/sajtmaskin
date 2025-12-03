export interface Improvement {
  item: string
  category?: string
  impact: 'high' | 'medium' | 'low'
  effort: 'low' | 'medium' | 'high'
  why?: string
  how?: string
  code_example?: string
  estimated_time?: string
  technologies?: string[]
}

export interface TechnicalRecommendation {
  area: string
  current_state: string
  recommendation: string
  implementation?: string
}

export interface AuditResult {
  audit_type: 'website_audit' | 'recommendation'
  company?: string
  domain?: string | null
  timestamp?: string
  audit_scores?: {
    seo?: number
    ux?: number
    content?: number
    performance?: number
    accessibility?: number
    technical_seo?: number
    security?: number
    mobile?: number
    [key: string]: number | undefined
  }
  improvements?: Improvement[]
  budget_estimate?: {
    low?: number
    high?: number
    immediate_fixes?: { low: number; high: number }
    full_optimization?: { low: number; high: number }
    ongoing_monthly?: { low: number; high: number }
    initial_development?: { low: number; high: number }
    annual_maintenance?: { low: number; high: number }
    marketing_launch?: { low: number; high: number }
    currency: string
    payment_structure?: string
  }
  cost: {
    tokens: number
    sek: number
    usd: number
  }
  strengths?: string[]
  issues?: string[]
  website_type_recommendation?: string
  expected_outcomes?: string[]
  security_analysis?: {
    https_status: string
    headers_analysis: string
    cookie_policy: string
    vulnerabilities?: string[]
  }
  competitor_insights?: {
    industry_standards: string
    missing_features: string
    unique_strengths: string
  }
  technical_recommendations?: TechnicalRecommendation[]
  priority_matrix?: {
    quick_wins?: string[]
    major_projects?: string[]
    fill_ins?: string[]
    thankless_tasks?: string[]
  }
  target_audience_analysis?: {
    demographics: string
    behaviors: string
    pain_points: string
    expectations: string
  }
  competitor_benchmarking?: {
    industry_leaders: string[]
    common_features: string[]
    differentiation_opportunities: string[]
  }
  technical_architecture?: {
    recommended_stack: {
      frontend: string
      backend: string
      cms: string
      hosting: string
    }
    integrations: string[]
    security_measures: string[]
  }
  content_strategy?: {
    key_pages: string[]
    content_types: string[]
    seo_foundation: string
    conversion_paths: string[]
  }
  design_direction?: {
    style: string
    color_psychology: string
    ui_patterns: string[]
    accessibility_level: string
  }
  implementation_roadmap?: {
    [phase: string]: {
      duration?: string
      deliverables?: string[]
      activities?: string[]
    }
  }
  success_metrics?: {
    kpis: string[]
    tracking_setup: string
    review_schedule: string
  }
}
