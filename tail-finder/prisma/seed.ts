import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient()

async function main() {
    const admin = await prisma.user.upsert({
        where: { email: 'bobby@aerotrack.com' },
        update: {
            username: 'bobby',
            role: 'admin'
        },
        create: {
            username: 'bobby',
            email: 'bobby@aerotrack.com',
            name: 'Bobby (Super Admin)',
            role: 'admin',
            image: 'https://avatar.vercel.sh/bobby',
        },
    })
    console.log({ admin })
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
