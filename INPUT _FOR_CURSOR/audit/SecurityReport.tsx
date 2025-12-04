'use client';

import { motion } from 'framer-motion';

interface SecurityReportProps {
  securityAnalysis: {
    https_status: string;
    headers_analysis: string;
    cookie_policy: string;
    vulnerabilities: string[];
  };
}

export default function SecurityReport({ securityAnalysis }: SecurityReportProps) {
  const getStatusColor = (status: string) => {
    if (status.toLowerCase().includes('ok') || status.toLowerCase().includes('bra')) {
      return 'text-green-400';
    }
    if (status.toLowerCase().includes('varning') || status.toLowerCase().includes('förbättra')) {
      return 'text-yellow-400';
    }
    return 'text-red-400';
  };

  const securityItems = [
    {
      icon: '🔒',
      label: 'HTTPS Status',
      value: securityAnalysis.https_status,
      description: 'Säker anslutning och SSL-certifikat'
    },
    {
      icon: '🛡️',
      label: 'Säkerhetshuvuden',
      value: securityAnalysis.headers_analysis,
      description: 'HTTP-säkerhetshuvuden och CSP'
    },
    {
      icon: '🍪',
      label: 'Cookie & GDPR',
      value: securityAnalysis.cookie_policy,
      description: 'Cookie-hantering och integritetspolicy'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
    >
      <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="text-3xl">🔐</span>
        Säkerhetsanalys
      </h3>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {securityItems.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{item.icon}</span>
              <h4 className="font-semibold text-gray-300">{item.label}</h4>
            </div>
            <p className={`text-lg font-medium ${getStatusColor(item.value)} mb-2`}>
              {item.value}
            </p>
            <p className="text-sm text-gray-500">{item.description}</p>
          </motion.div>
        ))}
      </div>

      {securityAnalysis.vulnerabilities && securityAnalysis.vulnerabilities.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-red-500/10 border border-red-500/20 rounded-xl p-6"
        >
          <h4 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
            <span>⚠️</span>
            Identifierade sårbarheter
          </h4>
          <ul className="space-y-3">
            {securityAnalysis.vulnerabilities.map((vulnerability, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="flex items-start gap-3"
              >
                <span className="text-red-400 mt-0.5">•</span>
                <div className="flex-1">
                  <p className="text-gray-300">{vulnerability}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Security Score Overview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 p-6 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-xl border border-white/10"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white mb-2">Säkerhetsrekommendationer</h4>
            <p className="text-gray-400">Implementera följande för att förbättra säkerheten:</p>
          </div>
          <div className="text-5xl opacity-20">🛡️</div>
        </div>
        <ul className="mt-4 space-y-2">
          <li className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span>
            Implementera Content Security Policy (CSP)
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span>
            Aktivera HSTS för säkrare HTTPS
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span>
            Sätt upp X-Frame-Options för clickjacking-skydd
          </li>
          <li className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span>
            Implementera SameSite cookie-attribut
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
