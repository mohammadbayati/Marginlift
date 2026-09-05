import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api")))
from internal_auth import auth_required, is_public_path, verify_internal_token  # noqa: E402


class ScorerInternalAuthTest(unittest.TestCase):
    def setUp(self):
        self.original = {
            "SCORER_AUTH_REQUIRED": os.environ.get("SCORER_AUTH_REQUIRED"),
            "SCORER_INTERNAL_TOKEN": os.environ.get("SCORER_INTERNAL_TOKEN"),
            "SCORER_INTERNAL_TOKEN_PREVIOUS": os.environ.get("SCORER_INTERNAL_TOKEN_PREVIOUS"),
            "SCORER_INTERNAL_TOKENS": os.environ.get("SCORER_INTERNAL_TOKENS"),
        }

    def tearDown(self):
        for key, value in self.original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def configure_required(self):
        os.environ["SCORER_AUTH_REQUIRED"] = "true"
        os.environ["SCORER_INTERNAL_TOKEN"] = "token-" + ("1" * 34)
        os.environ.pop("SCORER_INTERNAL_TOKEN_PREVIOUS", None)
        os.environ.pop("SCORER_INTERNAL_TOKENS", None)

    def test_valid_token(self):
        self.configure_required()
        self.assertTrue(auth_required())
        self.assertTrue(verify_internal_token(os.environ["SCORER_INTERNAL_TOKEN"]))

    def test_missing_token(self):
        self.configure_required()
        self.assertFalse(verify_internal_token(None))

    def test_invalid_token(self):
        self.configure_required()
        self.assertFalse(verify_internal_token("wrong-token"))

    def test_local_development_compatibility(self):
        os.environ["SCORER_AUTH_REQUIRED"] = "false"
        os.environ.pop("SCORER_INTERNAL_TOKEN", None)
        os.environ.pop("SCORER_INTERNAL_TOKEN_PREVIOUS", None)
        os.environ.pop("SCORER_INTERNAL_TOKENS", None)
        self.assertFalse(auth_required())
        self.assertTrue(verify_internal_token(None))

    def test_auth_mode_must_be_explicit(self):
        os.environ.pop("SCORER_AUTH_REQUIRED", None)
        os.environ.pop("SCORER_INTERNAL_TOKEN", None)
        os.environ.pop("SCORER_INTERNAL_TOKEN_PREVIOUS", None)
        os.environ.pop("SCORER_INTERNAL_TOKENS", None)
        with self.assertRaisesRegex(RuntimeError, "SCORER_AUTH_REQUIRED"):
            auth_required()

    def test_health_is_unauthenticated(self):
        self.configure_required()
        self.assertTrue(is_public_path("/health"))
        self.assertFalse(is_public_path("/api/v1/shadow/score"))


if __name__ == "__main__":
    unittest.main()
