import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { AuditResult, Improvement } from '@/types/audit';

// Register fonts (optional, for better typography)
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf' },
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf', fontWeight: 700 },
  ],
});

// Create styles
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 12,
    paddingTop: 50,
    paddingLeft: 60,
    paddingRight: 60,
    paddingBottom: 50,
    lineHeight: 1.5,
    flexDirection: 'column',
  },
  title: {
    fontSize: 32,
    marginBottom: 15,
    fontWeight: 900,
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 8,
    color: '#475569',
    textAlign: 'center',
    fontWeight: 600,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 12,
    fontWeight: 800,
    color: '#1e40af',
    borderBottomWidth: 3,
    borderBottomColor: '#3b82f6',
    paddingBottom: 8,
    letterSpacing: -0.3,
  },
  text: {
    fontSize: 12,
    marginBottom: 5,
    color: '#374151',
  },
  bold: {
    fontWeight: 700,
  },
  scoreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  scoreBox: {
    width: '30%',
    margin: '1.5%',
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 5,
    textAlign: 'center',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 5,
  },
  listItem: {
    fontSize: 12,
    marginBottom: 5,
    marginLeft: 20,
    color: '#374151',
  },
  improvementItem: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  improvementTitle: {
    fontSize: 15,
    fontWeight: 800,
    marginBottom: 6,
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  badge: {
    padding: '2 6',
    borderRadius: 4,
    fontSize: 10,
    marginRight: 5,
    marginBottom: 5,
  },
  highImpact: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  mediumImpact: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  lowImpact: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
  },
  lowEffort: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
  },
  mediumEffort: {
    backgroundColor: '#fed7aa',
    color: '#9a3412',
  },
  highEffort: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  costSection: {
    backgroundColor: '#eff6ff',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 20,
  },
  costTitle: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 12,
    color: '#1e40af',
    letterSpacing: -0.3,
  },
  costValue: {
    fontSize: 24,
    fontWeight: 900,
    color: '#2563eb',
    letterSpacing: -0.5,
  },
  footer: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    left: 60,
    right: 60,
    textAlign: 'center',
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  pageNumber: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    right: 60,
    color: '#9ca3af',
  },
});

// Helper function to get score color
const getScoreColor = (score: number) => {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
};

interface PDFReportProps {
  result: AuditResult;
}

const AuditPDFDocument: React.FC<PDFReportProps> = ({ result }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View>
        <Text style={styles.title}>
          {result.audit_type === 'website_audit' ? 'Webbplatsanalys' : 'Webbplatsrekommendationer'}
        </Text>
        {result.company && (
          <Text style={styles.subtitle}>{result.company}</Text>
        )}
        {result.domain && (
          <Text style={[styles.subtitle, { marginBottom: 20 }]}>{result.domain}</Text>
        )}
        <Text style={[styles.text, { textAlign: 'center', marginBottom: 30 }]}>
          Genererad: {new Date().toLocaleDateString('sv-SE')}
        </Text>
      </View>

      {/* Scores Section */}
      {result.audit_scores && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Poängöversikt</Text>
          <View style={styles.scoreContainer}>
            {Object.entries(result.audit_scores).map(([key, value]) => (
              <View key={key} style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>
                  {key.replace(/_/g, ' ').charAt(0).toUpperCase() + key.replace(/_/g, ' ').slice(1)}
                </Text>
                <Text style={[styles.scoreValue, { color: getScoreColor(value as number) }]}>
                  {String(value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Strengths */}
      {result.strengths && result.strengths.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Styrkor</Text>
          {result.strengths.map((strength: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {strength}
            </Text>
          ))}
        </View>
      )}

      {/* Issues */}
      {result.issues && result.issues.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Problem att åtgärda</Text>
          {result.issues.map((issue: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {issue}
            </Text>
          ))}
        </View>
      )}

      {/* Page Break for Improvements */}
      <View break />

      {/* Improvements */}
      {result.improvements && result.improvements.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Förbättringsförslag</Text>
          {result.improvements.slice(0, 10).map((improvement: Improvement, index: number) => (
            <View key={index} style={styles.improvementItem}>
              <Text style={styles.improvementTitle}>{improvement.item}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                <Text style={[
                  styles.badge,
                  improvement.impact === 'high' ? styles.highImpact :
                  improvement.impact === 'medium' ? styles.mediumImpact : styles.lowImpact
                ]}>
                  {improvement.impact === 'high' ? 'Hög påverkan' :
                   improvement.impact === 'medium' ? 'Medel påverkan' : 'Låg påverkan'}
                </Text>
                <Text style={[
                  styles.badge,
                  improvement.effort === 'low' ? styles.lowEffort :
                  improvement.effort === 'medium' ? styles.mediumEffort : styles.highEffort
                ]}>
                  {improvement.effort === 'low' ? 'Enkelt' :
                   improvement.effort === 'medium' ? 'Medel' : 'Svårt'}
                </Text>
              </View>
              {improvement.why && (
                <Text style={styles.text}>
                  <Text style={styles.bold}>Varför:</Text> {improvement.why}
                </Text>
              )}
              {improvement.how && (
                <Text style={styles.text}>
                  <Text style={styles.bold}>Hur:</Text> {improvement.how}
                </Text>
              )}
              {improvement.estimated_time && (
                <Text style={[styles.text, { fontStyle: 'italic', fontSize: 10 }]}>
                  Tidsuppskattning: {improvement.estimated_time}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Budget */}
      {result.budget_estimate && (
        <View style={styles.costSection}>
          <Text style={styles.costTitle}>Budgetuppskattning</Text>
          {result.budget_estimate.immediate_fixes && (
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.text}>
                <Text style={styles.bold}>Omedelbara åtgärder:</Text>{' '}
                {result.budget_estimate.immediate_fixes.low.toLocaleString('sv-SE')} - {' '}
                {result.budget_estimate.immediate_fixes.high.toLocaleString('sv-SE')} {result.budget_estimate.currency}
              </Text>
            </View>
          )}
          {result.budget_estimate.full_optimization && (
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.text}>
                <Text style={styles.bold}>Full optimering:</Text>{' '}
                {result.budget_estimate.full_optimization.low.toLocaleString('sv-SE')} - {' '}
                {result.budget_estimate.full_optimization.high.toLocaleString('sv-SE')} {result.budget_estimate.currency}
              </Text>
            </View>
          )}
          {result.budget_estimate.low && result.budget_estimate.high && (
            <View>
              <Text style={styles.costValue}>
                {result.budget_estimate.low.toLocaleString('sv-SE')} - {' '}
                {result.budget_estimate.high.toLocaleString('sv-SE')} {result.budget_estimate.currency}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Page Break for Additional Sections */}
      {(result.security_analysis || result.competitor_insights || result.technical_recommendations) && <View break />}

      {/* Security Analysis */}
      {result.security_analysis && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Säkerhetsanalys</Text>
          <Text style={styles.text}>
            <Text style={styles.bold}>HTTPS Status:</Text> {result.security_analysis.https_status}
          </Text>
          <Text style={styles.text}>
            <Text style={styles.bold}>Säkerhetshuvuden:</Text> {result.security_analysis.headers_analysis}
          </Text>
          <Text style={styles.text}>
            <Text style={styles.bold}>Cookie Policy:</Text> {result.security_analysis.cookie_policy}
          </Text>
          {result.security_analysis.vulnerabilities && result.security_analysis.vulnerabilities.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.text, styles.bold]}>Sårbarheter:</Text>
              {result.security_analysis.vulnerabilities.map((vuln: string, index: number) => (
                <Text key={index} style={styles.listItem}>
                  • {vuln}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Competitor Insights */}
      {result.competitor_insights && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konkurrentanalys</Text>
          <Text style={styles.text}>
            <Text style={styles.bold}>Branschstandarder:</Text> {result.competitor_insights.industry_standards}
          </Text>
          <Text style={[styles.text, { marginTop: 10 }]}>
            <Text style={styles.bold}>Saknade funktioner:</Text> {result.competitor_insights.missing_features}
          </Text>
          <Text style={[styles.text, { marginTop: 10 }]}>
            <Text style={styles.bold}>Unika styrkor:</Text> {result.competitor_insights.unique_strengths}
          </Text>
        </View>
      )}

      {/* Expected Outcomes */}
      {result.expected_outcomes && result.expected_outcomes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Förväntade resultat</Text>
          {result.expected_outcomes.map((outcome: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {outcome}
            </Text>
          ))}
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        Genererad av SajtStudio AI-driven webbanalys | {new Date().toLocaleDateString('sv-SE')}
      </Text>

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  </Document>
);

export default AuditPDFDocument;
