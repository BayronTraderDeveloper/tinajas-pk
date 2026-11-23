// Servidor en línea. La clave publicable está pensada para ir en el navegador (no es secreta).
export const SUPABASE = { url: import.meta.env?.VITE_SUPABASE_URL || '', key: import.meta.env?.VITE_SUPABASE_KEY || '' };
export const online = () => /^https:\/\/[\w.-]+$/.test(SUPABASE.url) && SUPABASE.key.length > 20;
