DROP POLICY IF EXISTS "Users own profiles" ON public.profiles;

CREATE POLICY "Users own profile"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);