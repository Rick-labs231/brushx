import { startMock } from './mock-supabase.ts'
const m = await startMock(Number(process.argv[2] ?? 8767))
console.log('mock supabase on', m.url)
