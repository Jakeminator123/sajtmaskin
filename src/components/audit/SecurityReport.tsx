"use client";

import { motion } from "framer-motion";
import type { SecurityAnalysis } from "@/types/audit";

interface SecurityReportProps {
  securityAnalysis: SecurityAnalysis;
}

export default function SecurityReport({ securityAnalysis }: SecurityReportProps) {
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
      className="border border-gray-800 bg-black/50 p-6"
    >
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
        <span className="text-brand-teal">🔒</span> Säkerhetsanalys
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* HTTPS Status */}
        <div className="border border-gray-800 bg-black/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-400">HTTPS-status</h4>
            <span className={`text-lg ${getStatusColor(securityAnalysis.https_status)}`}>
              {getStatusIcon(securityAnalysis.https_status)}
            </span>
          </div>
          <p className={`text-sm ${getStatusColor(securityAnalysis.https_status)}`}>
            {securityAnalysis.https_status}
          </p>
        </div>

        {/* Headers */}
        <div className="border border-gray-800 bg-black/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-400">Säkerhetshuvuden</h4>
            <span className={`text-lg ${getStatusColor(securityAnalysis.headers_analysis)}`}>
              {getStatusIcon(securityAnalysis.headers_analysis)}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-gray-300">{securityAnalysis.headers_analysis}</p>
        </div>

        {/* Cookie Policy */}
        <div className="border border-gray-800 bg-black/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-400">Cookie-policy / GDPR</h4>
            <span className={`text-lg ${getStatusColor(securityAnalysis.cookie_policy)}`}>
              {getStatusIcon(securityAnalysis.cookie_policy)}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-gray-300">{securityAnalysis.cookie_policy}</p>
        </div>

        {/* Vulnerabilities */}
        {securityAnalysis.vulnerabilities && securityAnalysis.vulnerabilities.length > 0 && (
          <div className="border border-red-500/30 bg-red-500/10 p-4">
            <h4 className="mb-2 text-sm font-medium text-red-400">⚠️ Potentiella sårbarheter</h4>
            <ul className="space-y-1">
              {securityAnalysis.vulnerabilities.map((vuln, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-red-300">
                  <span className="mt-0.5 text-red-400">•</span>
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
