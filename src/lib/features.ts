/** Features built but not yet switched on for the client. Flip to true to release. */
export const FEATURES = {
  /** Inbox / outbox messages between users (needs the profiles & messages database rules). */
  messaging: process.env.NEXT_PUBLIC_FEATURE_MESSAGING === "1",
};
