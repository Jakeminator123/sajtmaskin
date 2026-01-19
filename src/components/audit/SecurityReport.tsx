"use client";

import { motion } from "framer-motion";
import type { SecurityAnalysis } from "@/types/audit";

interface SecurityReportProps {
  securityAnalysis: SecurityAnalysis;
}

export default function SecurityReport({
  securityAnalysis,
}: SecurityReportProps) {
  const getStatusColor = (status: string) => {
    const lower = status.toLowerCase();
    if (
      lower.includes("ok") ||
      lower.includes("ja") ||
      lower.includes("aktiv") ||
      lower.includes("bra")
    ) {
      return "text-green-400";
    }
    if (lower.includes("varning") || lower.includes("delvis")) {
      return "text-brand-amber";
    }
    return "text-red-400";
  };

  const getStatusIcon = (status: string) => {
    const lower = status.toLowerCase();
    if (
      lower.includes("ok") ||
      lower.includes("ja") ||
      lower.includes("aktiv") ||
      lower.includes("bra")
    ) {
      return "✓";
    }
    if (lower.includes("varning") || lower.includes("delvis")) {
      return "⚠";
    }
    return "✗";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-gray-800 p-6"
    >
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="text-brand-teal">🔒</span> Säkerhetsanalys
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* HTTPS Status */}
        <div className="p-4 bg-black/30 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-400">HTTPS-status</h4>
            <span
              className={`text-lg ${getStatusColor(
                securityAnalysis.https_status
              )}`}
            >
              {getStatusIcon(securityAnalysis.https_status)}
            </span>
          </div>
          <p
            className={`text-sm ${getStatusColor(
              securityAnalysis.https_status
            )}`}
          >
            {securityAnalysis.https_status}
          </p>
        </div>

        {/* Headers */}
        <div className="p-4 bg-black/30 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-400">
              Säkerhetshuvuden
            </h4>
            <span
              className={`text-lg ${getStatusColor(
                securityAnalysis.headers_analysis
              )}`}
            >
              {getStatusIcon(securityAnalysis.headers_analysis)}
            </span>
          </div>
          <p className="text-sm text-gray-300 line-clamp-2">
            {securityAnalysis.headers_analysis}
          </p>
        </div>

        {/* Cookie Policy */}
        <div className="p-4 bg-black/30 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-400">
              Cookie-policy / GDPR
            </h4>
            <span
              className={`text-lg ${getStatusColor(
                securityAnalysis.cookie_policy
              )}`}
            >
              {getStatusIcon(securityAnalysis.cookie_policy)}
            </span>
          </div>
          <p className="text-sm text-gray-300 line-clamp-2">
            {securityAnalysis.cookie_policy}
          </p>
        </div>

        {/* Vulnerabilities */}
        {securityAnalysis.vulnerabilities &&
          securityAnalysis.vulnerabilities.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/30">
              <h4 className="text-sm font-medium text-red-400 mb-2">
                ⚠️ Potentiella sårbarheter
              </h4>
              <ul className="space-y-1">
                {securityAnalysis.vulnerabilities.map((vuln, index) => (
                  <li
                    key={index}
                    className="text-sm text-red-300 flex items-start gap-2"
                  >
                    <span className="text-red-400 mt-0.5">•</span>
                    <span>{vuln}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </motion.div>
  );
}
