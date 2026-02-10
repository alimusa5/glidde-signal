// Import the function used to create a Supabase client
import { createClient } from "@supabase/supabase-js";

// Create and export a single Supabase client instance
// This client will be reused across the entire app
export const supabase = createClient(
  // Supabase project URL (comes from .env.local)
  process.env.NEXT_PUBLIC_SUPABASE_URL!,

  // Public anon key used for client-side requests
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

//createClient(URL, KEY)
//URL → tells the app which Supabase project to connect to
//KEY → tells Supabase who is allowed to make requests
//The ! at the end tells TypeScript: “I guarantee this value exists” & prevents TypeScript errors during build
