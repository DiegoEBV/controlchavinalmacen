-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create Audit Log Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- The admin who performed the action
    target_user_id UUID REFERENCES auth.users(id), -- The user who was affected
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view audit logs (optional, but good practice)
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role = 'admin'
        )
    );

-- Create RPC Function for Admin Password Reset
CREATE OR REPLACE FUNCTION admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS VOID AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- 1. Verificación de Seguridad
    SELECT (role = 'admin') INTO is_admin FROM public.profiles WHERE id = auth.uid();
    
    IF NOT is_admin OR is_admin IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.';
    END IF;

    -- 2. Actualización de Contraseña
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 3. Invalidar sesiones activas (Forzar Logout)
    
    -- Intentar borrar de auth.sessions
    BEGIN
        DELETE FROM auth.sessions WHERE user_id = target_user_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error al borrar de auth.sessions: %', SQLERRM;
    END;

    -- Intentar borrar de auth.refresh_tokens (para versiones antiguas o compatibilidad)
    BEGIN
        DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error al borrar de auth.refresh_tokens: %', SQLERRM;
    END;

    -- 4. Registro en Auditoría
    INSERT INTO public.audit_logs (user_id, target_user_id, action, details)
    VALUES (auth.uid(), target_user_id, 'PASSWORD_RESET', 'Contraseña cambiada. Intent de cierre de sesión realizado.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
