import { createContext, useContext } from 'react';
import { useStore } from '@neondatabase/auth/react';
import { authClient } from '../lib/auth-client';
import type { AdminUser } from '../lib/types';

interface AuthContextType {
    user: AdminUser | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signInWithGoogle: async () => { },
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const sessionStore = useStore(authClient.useSession);
    const session = sessionStore?.data;
    const isPending = sessionStore?.isPending;

    const user = session?.user ? {
        id: session.user.id,
        email: session.user.email,
        display_name: session.user.name || 'User',
        emailVerified: session.user.emailVerified,
    } : null;

    const signInWithGoogle = async () => {
        await authClient.signIn.social({
            provider: 'google',
            callbackURL: window.location.origin + '/auth/callback'
        });
    };

    const signOut = async () => {
        try {
            await authClient.signOut();
        } catch (err) {
            console.error('[Auth] signOut error:', err);
        }

        // Thoroughly clear any session tokens from client cookies
        const cookieNames = [
            'neon-auth.session_token',
            '__Secure-neon-auth.session_token',
            'better-auth.session_token',
            '__Secure-better-auth.session_token',
            'neon-auth.session_data',
            'better-auth.session_data',
        ];
        cookieNames.forEach((name) => {
            document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;`;
            document.cookie = `${name}=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;`;
            document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;`;
        });

        // Clear local storage and session storage
        try {
            sessionStorage.clear();
            localStorage.clear();
        } catch {}
    };

    return (
        <AuthContext.Provider value={{ user, loading: isPending, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
