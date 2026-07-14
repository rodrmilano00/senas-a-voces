import { supabase } from '../lib/supabaseClient';

function hasSupabase() {
  if (supabase) return true;
  console.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return false;
}

// Fetch user progress
export async function fetchUserProgress(userId) {
  if (!hasSupabase()) return null;

  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user progress:', error);
    return null;
  }
}

// Fetch module progress for a user
export async function fetchModuleProgress(userId) {
  if (!hasSupabase()) return [];

  try {
    const { data, error } = await supabase
      .from('module_progress')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching module progress:', error);
    return [];
  }
}

// Update user progress after completing a sign
export async function updateSignProgress(userId, signName, module, accuracy, timeSpent) {
  if (!hasSupabase()) return { success: false, error: new Error('Supabase is not configured') };

  try {
    // Record the practice session
    const { error: practiceError } = await supabase
      .from('sign_practice')
      .insert({
        user_id: userId,
        sign_name: signName,
        module: module,
        accuracy: accuracy,
        time_spent: timeSpent,
      });

    if (practiceError) throw practiceError;

    // Update user progress
    const { data: currentProgress, error: fetchError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newTotalSigns = (currentProgress.total_signs_learned || 0) + 1;
    const newTotalTime = (currentProgress.total_practice_time || 0) + Math.floor(timeSpent / 60);
    const newAverageAccuracy = (
      (currentProgress.average_accuracy * currentProgress.total_signs_learned + accuracy) / newTotalSigns
    ).toFixed(2);

    const { error: updateError } = await supabase
      .from('user_progress')
      .update({
        total_signs_learned: newTotalSigns,
        total_practice_time: newTotalTime,
        average_accuracy: parseFloat(newAverageAccuracy),
        last_practice_date: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    console.error('Error updating sign progress:', error);
    return { success: false, error };
  }
}

// Update module progress
export async function updateModuleProgress(userId, moduleId, signsCompleted, totalSigns, status) {
  if (!hasSupabase()) return { success: false, error: new Error('Supabase is not configured') };

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('module_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('module_id', moduleId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existing) {
      // Update existing module progress
      const { error: updateError } = await supabase
        .from('module_progress')
        .update({
          signs_completed: signsCompleted,
          total_signs: totalSigns,
          status: status || existing.status,
        })
        .eq('user_id', userId)
        .eq('module_id', moduleId);

      if (updateError) throw updateError;
    } else {
      // Create new module progress
      const { error: insertError } = await supabase
        .from('module_progress')
        .insert({
          user_id: userId,
          module_id: moduleId,
          signs_completed: signsCompleted,
          total_signs: totalSigns,
          status: status || 'current',
        });

      if (insertError) throw insertError;
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating module progress:', error);
    return { success: false, error };
  }
}

// Update streak
export async function updateStreak(userId) {
  if (!hasSupabase()) return { success: false, error: new Error('Supabase is not configured') };

  try {
    const { data: currentProgress, error: fetchError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const lastPractice = currentProgress.last_practice_date ? new Date(currentProgress.last_practice_date) : null;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = currentProgress.streak_days || 0;

    if (lastPractice) {
      // Check if last practice was yesterday (consecutive day)
      if (lastPractice.toDateString() === yesterday.toDateString()) {
        newStreak += 1;
      }
      // Check if last practice was today (already practiced today)
      else if (lastPractice.toDateString() === today.toDateString()) {
        newStreak = newStreak; // Keep same streak
      }
      // Streak broken
      else {
        newStreak = 1;
      }
    } else {
      // First practice ever
      newStreak = 1;
    }

    const { error: updateError } = await supabase
      .from('user_progress')
      .update({
        streak_days: newStreak,
        last_practice_date: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return { success: true, streak: newStreak };
  } catch (error) {
    console.error('Error updating streak:', error);
    return { success: false, error };
  }
}

// Get recent practice history
export async function getRecentPractice(userId, limit = 10) {
  if (!hasSupabase()) return [];

  try {
    const { data, error } = await supabase
      .from('sign_practice')
      .select('*')
      .eq('user_id', userId)
      .order('practice_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching recent practice:', error);
    return [];
  }
}
