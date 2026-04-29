import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wvscgofzdxkkkkktmbjh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2c2Nnb2Z6ZHhra2tra3RtYmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NDIxMDYsImV4cCI6MjA5MTMxODEwNn0.C3EERBYdX4l-_MpM0iN3AcQ9kOVQUx3JXS8p_CTmGec';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);