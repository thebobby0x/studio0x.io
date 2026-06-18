import type { DefaultSession } from "next-auth";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "WHITE_LABEL" | "USER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}
