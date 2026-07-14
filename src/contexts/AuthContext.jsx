import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userProgress, setUserProgress] = useState(null);
  const [moduleProgress, setModuleProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchUserProgress(session.user.id);
        fetchModuleProgress(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchUserProgress(session.user.id);
        fetchModuleProgress(session.user.id);
      } else {
        setProfile(null);
        setUserProgress(null);
        setModuleProgress([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchUserProgress = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        // If no progress exists yet, create default
        if (error.code === 'PGRST116') {
          setUserProgress({
            current_level: 1,
            current_lesson: 1,
            lesson_progress: {},
            total_signs_learned: 0,
            total_practice_time: 0,
            average_accuracy: 0,
            streak_days: 0,
            weekly_activity: [],
            daily_quests: [],
          });
        } else {
          throw error;
        }
      } else {
        setUserProgress(data);
      }
    } catch (error) {
      console.error('Error fetching user progress:', error);
    }
  };

  const fetchModuleProgress = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('module_progress')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      setModuleProgress(data || []);
    } catch (error) {
      console.error('Error fetching module progress:', error);
    }
  };

  const signUp = async ({ email, password, fullName }) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: undefined,
        },
      });

      if (error) throw error;
      
      // Check if user was created but session is null (email confirmation required)
      if (data.user && !data.session) {
        return { 
          data, 
          requiresEmailConfirmation: true,
          email: email,
          error: null 
        };
      }
      
      return { data, error: null, requiresEmailConfirmation: false };
    } catch (error) {
      return { data: null, error, requiresEmailConfirmation: false };
    }
  };

  const signIn = async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    profile,
    userProgress,
    moduleProgress,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
