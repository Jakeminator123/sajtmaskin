import unittest
from unittest.mock import patch

import diagnostics


class ProviderDiagnosticsTest(unittest.TestCase):
    def test_billing_permission_does_not_report_an_invalid_voice_key(self):
        issue = diagnostics.classify("ElevenLabs", 401, {"detail": {"status": "missing_permissions",
                                                                    "message": "requires user_read"}})
        self.assertIn("user_read", str(issue))
        self.assertNotIn("avvisades", str(issue))

    def test_quota_and_throttling_are_different_even_with_the_same_http_status(self):
        self.assertIn("krediter", str(diagnostics.classify("OpenAI", 429, "insufficient_quota")))
        self.assertIn("anrop", str(diagnostics.classify("OpenAI", 429, "rate_limit_exceeded")))
        self.assertNotIn("private-upstream", str(diagnostics.classify("RunPod", 500, "private-upstream")))

    def test_actual_balances_include_units_and_overage_terms(self):
        with patch.object(diagnostics, "checked_key", return_value="test"), \
             patch.object(diagnostics, "read_json", side_effect=[
                 {"balanceAmount": 14.5, "billingMode": "POSTPAID"},
                 {"character_limit": 1000, "character_count": 1000, "allowed_to_extend_character_limit": True},
             ]):
            self.assertIn("14,50 USD. Fakturakonto", diagnostics.balance())
            self.assertIn("0 av 1 000 inkluderade krediter kvar. Debitering utöver", diagnostics.subscription())
