# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for the project to be ready (2-3 minutes)

## 2. Run the Database Schema

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of `supabase-schema.sql` from this repository
5. Paste it into the SQL Editor
6. Click **Run** to execute the schema

This will create:
- `profiles` table - User profile information
- `user_progress` table - Overall user progress tracking
- `module_progress` table - Progress per learning module
- `sign_practice` table - Individual sign practice records
- Row Level Security (RLS) policies
- Triggers for automatic profile creation

## 3. Enable Email Authentication

1. Go to **Authentication** → **Providers** in your Supabase dashboard
2. Ensure **Email** provider is enabled
3. Configure email settings if needed (SMTP settings for production)

## 4. Update Environment Variables

The `.env` file should already be configured with your Supabase credentials:

```
VITE_SUPABASE_URL=https://mfqogjnhjqjucwwwwsha.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_3O6UOMwpruhHI5FEmQXoow_FTsHfiYy
```

## 5. Test the Application

1. Run the development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173

3. Test registration:
   - Click "Regístrate gratis"
   - Fill in name, email, and password
   - Submit the form

4. Test login:
   - Use the credentials you just created
   - Verify you can access the dashboard

## Database Schema Overview

### profiles
- `id` - UUID (references auth.users)
- `full_name` - User's full name
- `avatar_initials` - First 2 letters of name for avatar
- `created_at`, `updated_at` - Timestamps

### user_progress
- `user_id` - UUID (references profiles)
- `current_level` - Current learning level
- `current_lesson` - Current lesson number
- `lesson_progress` - JSONB object with lesson completion percentages
- `total_signs_learned` - Total count of signs learned
- `total_practice_time` - Total practice time in minutes
- `average_accuracy` - Average accuracy across all practices
- `streak_days` - Current practice streak
- `last_practice_date` - Date of last practice
- `weekly_activity` - JSONB array for activity heatmap
- `daily_quests` - JSONB array for completed daily quests

### module_progress
- `user_id` - UUID (references profiles)
- `module_id` - Module identifier (e.g., "alphabet", "numbers")
- `status` - "current", "completed", or "locked"
- `signs_completed` - Number of signs completed in module
- `total_signs` - Total signs in module

### sign_practice
- `user_id` - UUID (references profiles)
- `sign_name` - Name of the sign practiced
- `module` - Module the sign belongs to
- `accuracy` - Accuracy score (0-100)
- `practice_date` - Timestamp of practice
- `time_spent` - Time spent in seconds

## Security Notes

- Row Level Security (RLS) is enabled on all tables
- Users can only access their own data
- The `anon` key is safe for client-side use
- Never expose your `service_role` key in the frontend

## Troubleshooting

### Registration fails with "Email not confirmed"
- Check your email provider settings in Supabase
- For development, you can disable email confirmation in Authentication → Settings

### "Missing Supabase environment variables" error
- Ensure `.env` file exists in project root
- Verify the variables are named correctly (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Restart the dev server after adding the .env file

### Database errors
- Verify the schema was executed successfully in SQL Editor
- Check the table names match exactly what's in the schema
- Ensure RLS policies are enabled
