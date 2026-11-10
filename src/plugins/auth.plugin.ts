export type Principal = {
  userId: string;
  role: "admin" | "ta" | "student";
  classIds: number[];
};

export type Authenticator = (
  authorizationHeader: string | null,
) => Principal | null | Promise<Principal | null>;

/** Default behavior is closed until a real credential verifier is wired in. */
export const denyAllAuthenticator: Authenticator = () => null;
