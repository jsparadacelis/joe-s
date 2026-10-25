import time
from unittest.mock import Mock

import pytest

from backend.app.study.domain.errors import Unauthenticated
from backend.app.study.domain.ports import TokenClaims
from backend.app.study.infrastructure.supabase_jwt_verifier import SupabaseJwtVerifier
from backend.tests.study.infrastructure.jwt_helpers import (
    ISSUER,
    SUPABASE_URL,
    KeyPair,
    claims,
    forge,
    jwks,
    sign,
)


@pytest.fixture(scope="module")
def pair():
    return KeyPair("key-1")


@pytest.fixture(scope="module")
def other_pair():
    return KeyPair("key-1")  # same kid, different key: the signature cannot match


@pytest.fixture
def fetch(pair):
    return Mock(return_value=jwks(pair))


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def verifier(fetch, clock):
    return SupabaseJwtVerifier(SUPABASE_URL, fetch, monotonic=clock)


class TestValidToken:
    def test_returns_subject_email_verification_and_assurance_level(self, verifier, pair):
        result = verifier.verify(sign(pair, claims(aal="aal2")))

        assert result == TokenClaims(
            subject="11111111-1111-1111-1111-111111111111",
            email="ana@example.com",
            email_verified=True,
            aal="aal2",
        )

    def test_the_supabase_url_may_end_with_a_slash(self, fetch, pair):
        verifier = SupabaseJwtVerifier(SUPABASE_URL + "/", fetch)

        assert verifier.verify(sign(pair)).email == "ana@example.com"

    def test_a_missing_aal_claim_counts_as_aal1(self, verifier, pair):
        assert verifier.verify(sign(pair, claims(aal=None))).aal == "aal1"

    @pytest.mark.parametrize(
        "metadata", [{}, {"email_verified": False}, {"email_verified": "true"}, None]
    )
    def test_email_is_unverified_unless_the_claim_is_exactly_true(self, verifier, pair, metadata):
        token = sign(pair, claims(user_metadata=metadata))

        assert verifier.verify(token).email_verified is False

    def test_a_top_level_email_verified_claim_also_counts(self, verifier, pair):
        token = sign(pair, claims(user_metadata=None, email_verified=True))

        assert verifier.verify(token).email_verified is True

    def test_the_keys_are_fetched_once_and_cached(self, verifier, pair, fetch):
        verifier.verify(sign(pair))
        verifier.verify(sign(pair))

        assert fetch.call_count == 1

    def test_the_jwks_is_asked_for_the_project_well_known_url(self, pair):
        fetch = Mock(return_value=jwks(pair))
        SupabaseJwtVerifier(SUPABASE_URL, fetch).verify(sign(pair))

        fetch.assert_called_once_with(f"{ISSUER}/.well-known/jwks.json")


class TestInvalidTokens:
    def test_wrong_signature(self, verifier, other_pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(other_pair))

    def test_tampered_payload(self, verifier, pair):
        header, payload, signature = sign(pair).split(".")
        forged_payload = sign(pair, claims(email="evil@example.com")).split(".")[1]

        with pytest.raises(Unauthenticated):
            verifier.verify(f"{header}.{forged_payload}.{signature}")

    def test_expired(self, verifier, pair):
        token = sign(pair, claims(exp=int(time.time()) - 3600, iat=int(time.time()) - 7200))

        with pytest.raises(Unauthenticated):
            verifier.verify(token)

    def test_not_valid_yet(self, verifier, pair):
        token = sign(pair, claims(nbf=int(time.time()) + 3600))

        with pytest.raises(Unauthenticated):
            verifier.verify(token)

    def test_without_expiry(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(exp=None)))

    def test_wrong_issuer(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(iss="https://evil.example/auth/v1")))

    def test_missing_issuer(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(iss=None)))

    @pytest.mark.parametrize("audience", ["anon", "service_role", None, ["other"]])
    def test_wrong_audience(self, verifier, pair, audience):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(aud=audience)))

    def test_without_subject(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(sub=None)))

    def test_with_blank_subject(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(sub="  ")))

    def test_without_email(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(email=None)))

    @pytest.mark.parametrize(
        "email", ["a\x00@example.com", "a\ud800@example.com", "a" * 243 + "@example.com"]
    )
    def test_with_an_unstorable_or_too_long_email(self, verifier, pair, email):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(email=email)))

    @pytest.mark.parametrize("subject", ["sub\x00", "sub\ud800"])
    def test_with_an_unstorable_subject(self, verifier, pair, subject):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(sub=subject)))

    def test_with_blank_email(self, verifier, pair):
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair, claims(email="")))

    @pytest.mark.parametrize("token", ["", "garbage", "a.b.c", "a.b", "....", " "])
    def test_not_a_jwt(self, verifier, token):
        with pytest.raises(Unauthenticated):
            verifier.verify(token)

    def test_token_without_kid(self, verifier, pair):
        import jwt

        token = jwt.encode(claims(), pair.private_pem, algorithm="ES256")

        with pytest.raises(Unauthenticated):
            verifier.verify(token)


class TestAlgorithmAttacks:
    def test_alg_none_is_rejected(self, verifier):
        with pytest.raises(Unauthenticated):
            verifier.verify(forge(claims(), "none", kid="key-1"))

    def test_hs256_signed_with_the_public_key_as_secret_is_rejected(self, verifier, pair):
        # Algorithm confusion: the attacker only knows the public key.
        for secret in (pair.public_pem, pair.jwk["x"].encode()):
            with pytest.raises(Unauthenticated):
                verifier.verify(forge(claims(), "HS256", secret=secret, kid="key-1"))

    def test_hs256_signed_with_a_guessable_secret_is_rejected(self, verifier):
        with pytest.raises(Unauthenticated):
            verifier.verify(forge(claims(), "HS256", secret=b"secret", kid="key-1"))

    def test_rs256_header_is_rejected(self, verifier, pair):
        header_forged = forge(claims(), "RS256", kid="key-1")

        with pytest.raises(Unauthenticated):
            verifier.verify(header_forged)


class TestKeyRotation:
    def test_an_unknown_kid_reloads_the_jwks_once_and_then_accepts_the_new_key(self, pair):
        rotated = KeyPair("key-2")
        fetch = Mock(side_effect=[jwks(pair), jwks(pair, rotated)])
        verifier = SupabaseJwtVerifier(SUPABASE_URL, fetch)
        verifier.verify(sign(pair))

        result = verifier.verify(sign(rotated))

        assert result.email == "ana@example.com"
        assert fetch.call_count == 2

    def test_an_unknown_kid_that_stays_unknown_is_rejected_after_one_reload(self, pair):
        fetch = Mock(return_value=jwks(pair))
        verifier = SupabaseJwtVerifier(SUPABASE_URL, fetch)
        stranger = KeyPair("not-published")

        with pytest.raises(Unauthenticated):
            verifier.verify(sign(stranger))

        assert fetch.call_count == 2  # first load + one reload

    def test_reloads_are_rate_limited_so_bad_kids_cannot_hammer_the_endpoint(self, pair, clock):
        fetch = Mock(return_value=jwks(pair))
        verifier = SupabaseJwtVerifier(SUPABASE_URL, fetch, monotonic=clock)
        stranger = KeyPair("not-published")
        for _ in range(5):
            with pytest.raises(Unauthenticated):
                verifier.verify(sign(stranger))

        assert fetch.call_count == 2

        clock.now += 31
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(stranger))

        assert fetch.call_count == 3

    def test_a_failing_jwks_endpoint_is_a_rejection_not_a_crash(self, pair):
        fetch = Mock(side_effect=OSError("network down"))
        verifier = SupabaseJwtVerifier(SUPABASE_URL, fetch)

        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair))

    def test_a_malformed_jwks_is_a_rejection(self, pair):
        verifier = SupabaseJwtVerifier(SUPABASE_URL, Mock(return_value={"nope": 1}))

        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair))

    def test_the_verifier_recovers_after_the_endpoint_comes_back(self, pair, clock):
        fetch = Mock(side_effect=[OSError("down"), jwks(pair)])
        verifier = SupabaseJwtVerifier(SUPABASE_URL, fetch, monotonic=clock)
        with pytest.raises(Unauthenticated):
            verifier.verify(sign(pair))

        clock.now += 31

        assert verifier.verify(sign(pair)).email == "ana@example.com"
