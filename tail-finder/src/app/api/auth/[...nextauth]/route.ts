
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";


export const authOptions = {
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: "jwt" as const,
    },
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "mock-google-id",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-google-secret",
        }),
        AppleProvider({
            clientId: process.env.APPLE_ID || "mock-apple-id",
            clientSecret: process.env.APPLE_SECRET || "mock-apple-secret",
        }),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Agent ID", type: "text", placeholder: "AGENT-007" },
                password: { label: "Access Code", type: "password" }
            },
            async authorize(credentials, req) {
                if (!credentials?.username || !credentials?.password) return null;

                // DB Lookup
                const user = await prisma.user.findUnique({
                    where: { username: credentials.username }
                });

                // If user exists and is Admin (mock password check for demo)
                if (user && user.role === 'admin' && credentials.password === 'admin') {
                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    };
                }

                // Fallback for standard demo agent (not in DB yet, or hardcoded for ease)
                if (credentials.username === "AGENT-007" && credentials.password === "secret") {
                    return { id: "1", name: "Agent 007", email: "bond@aerotrack.com", role: "user" };
                }

                return null;
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }: { token: any, user: any }) {
            if (user) {
                token.role = (user as any).role || "user";
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }: { session: any, token: any }) {
            if (session?.user) {
                session.user.role = token.role as string;
                session.user.id = token.id as string;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login',
    }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
