import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = (user as { role?: string }).role ?? "USER";
      return session;
    },
    async signIn({ user }) {
      // Ensure super admin promotion runs on every sign-in, not just first
      if (user.email === "b@studio0x.io") {
        await prisma.user.updateMany({
          where: { email: "b@studio0x.io", NOT: { role: "SUPER_ADMIN" } },
          data: { role: "SUPER_ADMIN" },
        });
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email === "b@studio0x.io") {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "SUPER_ADMIN" },
        });
      }
    },
  },
});
