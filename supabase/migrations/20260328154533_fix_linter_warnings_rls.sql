-- Migration to fix Supabase Linter Warnings (auth_rls_initplan and multiple_permissive_policies)

-- 1. Fix auth_rls_initplan dynamically for all policies containing auth.uid(), auth.jwt(), or current_setting()
DO $$ 
DECLARE
    p RECORD;
    base_query TEXT;
    new_qual TEXT;
    new_with_check TEXT;
BEGIN
    FOR p IN 
        SELECT 
            schemaname as schema, 
            tablename as table_name, 
            policyname as policy_name, 
            roles, 
            cmd, 
            qual, 
            with_check 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND (
               qual LIKE '%auth.uid()%' 
               OR with_check LIKE '%auth.uid()%'
               OR qual LIKE '%auth.jwt()%' 
               OR with_check LIKE '%auth.jwt()%'
               OR qual LIKE '%current_setting%' 
          )
    LOOP
        -- Skip if already wrapped with SELECT
        IF (p.qual IS NOT NULL AND p.qual LIKE '%(SELECT auth.uid())%') OR 
           (p.with_check IS NOT NULL AND p.with_check LIKE '%(SELECT auth.uid())%') THEN
             CONTINUE;
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', p.policy_name, p.schema, p.table_name);
        
        base_query := format('CREATE POLICY %I ON %I.%I FOR %s TO %s', 
                             p.policy_name, p.schema, p.table_name, p.cmd, array_to_string(p.roles, ', '));
        
        IF p.qual IS NOT NULL THEN
            new_qual := REPLACE(p.qual, 'auth.uid()', '(SELECT auth.uid())');
            new_qual := REPLACE(new_qual, 'auth.jwt()', '(SELECT auth.jwt())');
            new_qual := REPLACE(new_qual, 'current_setting(''request.jwt.claims'')', '(SELECT current_setting(''request.jwt.claims'', true))');
            new_qual := REPLACE(new_qual, 'current_setting(''request.jwt.claim.role'')', '(SELECT current_setting(''request.jwt.claim.role'', true))');
            base_query := base_query || format(' USING (%s)', new_qual);
        END IF;

        IF p.with_check IS NOT NULL THEN
            new_with_check := REPLACE(p.with_check, 'auth.uid()', '(SELECT auth.uid())');
            new_with_check := REPLACE(new_with_check, 'auth.jwt()', '(SELECT auth.jwt())');
            base_query := base_query || format(' WITH CHECK (%s)', new_with_check);
        END IF;

        EXECUTE base_query;
    END LOOP;
END $$;



