/**
 * sunatService.ts
 * Integración con Decolecta API para obtener el tipo de cambio de la SUNAT.
 * Actualizado para usar una Edge Function de Supabase como proxy seguro.
 */

import { supabase } from '../config/supabaseClient';

export interface ExchangeRateResponse {
    buy_price: string;
    sell_price: string;
    base_currency: string;
    quote_currency: string;
    date: string;
}

/**
 * Obtiene el tipo de cambio actual de la SUNAT llamando a una Supabase Edge Function.
 * Esto resuelve problemas de CORS y protege el Token de Decolecta.
 * @returns {Promise<number>} El precio de venta (sell_price) como número.
 */
export const getSunatExchangeRate = async (): Promise<number> => {
    try {
        // Llamamos a la Edge Function de Supabase
        const { data, error } = await supabase.functions.invoke('get-sunat-exchange-rate');

        if (error) {
            console.error('Error invoking Supabase Edge Function:', error);
            return 0;
        }

        if (!data) {
            console.error('No data received from Edge Function');
            return 0;
        }

        // Retornamos el precio de venta (sell_price)
        return parseFloat(data.sell_price) || 0;
    } catch (error) {
        console.error('Unexpected error in getSunatExchangeRate:', error);
        return 0;
    }
};
