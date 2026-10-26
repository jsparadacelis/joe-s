/**
 * Hand-made fake of the slice of the Supabase browser client that RGB-2b uses.
 * Contract for the implementation: components receive a client with this shape through a prop
 * (`AuthClient` type exported from `@/lib/auth`); nothing here touches the network.
 */
export interface FakeAuthClient {
  auth: {
    signInWithOAuth: jest.Mock;
    signOut: jest.Mock;
    mfa: {
      listFactors: jest.Mock;
      enroll: jest.Mock;
      challenge: jest.Mock;
      verify: jest.Mock;
    };
  };
}

export const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
export const QR_DATA_URI = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

export function createFakeAuthClient(): FakeAuthClient {
  return {
    auth: {
      signInWithOAuth: jest.fn().mockResolvedValue({ data: { provider: "google", url: "https://accounts.example.com" }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      mfa: {
        // No verified factor yet: the panel starts the enrolment.
        listFactors: jest.fn().mockResolvedValue({ data: { all: [], totp: [] }, error: null }),
        enroll: jest.fn().mockResolvedValue({
          data: { id: "factor-1", type: "totp", totp: { qr_code: QR_DATA_URI, secret: TOTP_SECRET, uri: `otpauth://totp/RGB:ana@example.com?secret=${TOTP_SECRET}` } },
          error: null,
        }),
        challenge: jest.fn().mockResolvedValue({ data: { id: "challenge-1" }, error: null }),
        verify: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  };
}

/** A client whose person already has a verified TOTP factor: the panel only verifies. */
export function withVerifiedFactor(client: FakeAuthClient, factorId = "factor-9"): FakeAuthClient {
  client.auth.mfa.listFactors.mockResolvedValue({
    data: { all: [{ id: factorId, factor_type: "totp", status: "verified" }], totp: [{ id: factorId, factor_type: "totp", status: "verified" }] },
    error: null,
  });
  return client;
}
