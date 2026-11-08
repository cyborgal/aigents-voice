import { AuthForm } from '@/components/auth-form';
import { isSupabaseConfigured } from '@/lib/supabase/server';
export default function Signup() { return <AuthForm mode="signup" configured={isSupabaseConfigured()} />; }
