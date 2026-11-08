import { CommandCenter } from '@/components/command-center';
import { demoBusiness, demoCalls } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default function Demo() { return <CommandCenter business={demoBusiness} calls={demoCalls()} mode="demo" preview email="alex@example.com" />; }
