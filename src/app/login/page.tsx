import { AuthForm } from '@/components/auth-form';
import { isSupabaseConfigured } from '@/lib/supabase/server';
export default function Login() { return <AuthForm mode="login" configured={isSupabaseConfigured()} />; }
