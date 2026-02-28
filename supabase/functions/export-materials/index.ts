import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                ...corsHeaders,
                'Access-Control-Max-Age': '86400',
            }
        })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

        // Manual JWT verification
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('No se proporcionó token de autorización')
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token)

        if (authError || !user) {
            console.error("Auth error:", authError)
            return new Response(
                JSON.stringify({ error: 'No autorizado' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`Export requested by user: ${user.email}`)

        // Use service role for database operations (e.g. storage upload)
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        // Create a ReadableStream for the CSV
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        // Background process to fetch and write data in batches
        const processStream = async () => {
            try {
                // Write UTF-8 BOM for Excel compatibility
                await writer.write(encoder.encode("\ufeff"))

                // Write CSV Header
                await writer.write(encoder.encode("ID,Descripcion,Unidad,Categoria\n"))

                let from = 0
                const pageSize = 1000
                let hasMore = true

                while (hasMore) {
                    const { data, error } = await supabaseClient
                        .from('materiales')
                        .select('id, descripcion, unidad, categoria')
                        .range(from, from + pageSize - 1)
                        .order('descripcion', { ascending: true })

                    if (error) {
                        console.error("Database query error:", error)
                        throw error
                    }

                    if (!data || data.length === 0) {
                        hasMore = false
                        break
                    }

                    // Write rows to stream
                    for (const m of data) {
                        // Escape double quotes in description
                        const cleanDesc = (m.descripcion || '').replace(/"/g, '""')
                        const row = `"${m.id}","${cleanDesc}","${m.unidad}","${m.categoria}"\n`
                        await writer.write(encoder.encode(row))
                    }

                    if (data.length < pageSize) {
                        hasMore = false
                    } else {
                        from += pageSize
                    }
                }
            } catch (err) {
                console.error("Stream generation error:", err)
            } finally {
                await writer.close()
            }
        }

        // Start the background process
        processStream()

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const fileName = `catalogo_materiales_${timestamp}.csv`
        const filePath = `${fileName}`

        // Upload the stream to storage
        const { error: uploadError } = await supabaseClient.storage
            .from('descargas')
            .upload(filePath, readable, {
                contentType: 'text/csv',
                duplex: 'half',
                cacheControl: '3600',
                upsert: true
            })

        if (uploadError) {
            console.error("Storage upload error:", uploadError)
            throw uploadError
        }

        // Generate signed URL (valid for 5 minutes)
        const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
            .from('descargas')
            .createSignedUrl(filePath, 300)

        if (signedUrlError) {
            console.error("Signed URL error:", signedUrlError)
            throw signedUrlError
        }

        return new Response(
            JSON.stringify({ url: signedUrlData.signedUrl, fileName }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error("Edge Function error:", error.message)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
