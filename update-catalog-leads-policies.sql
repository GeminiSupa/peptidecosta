-- Add UPDATE and DELETE policies to allow authenticated admins to manage leads

-- Allow authenticated users (admins) to update leads
CREATE POLICY "Allow authenticated updates on catalog_leads" 
ON public.catalog_leads FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow authenticated users (admins) to delete leads
CREATE POLICY "Allow authenticated deletes on catalog_leads" 
ON public.catalog_leads FOR DELETE 
TO authenticated 
USING (true);
