# TINAJAS PK

Simulador de mortales para navegador (HTML + Three.js). Modo libre 3D, niveles 2D de puntería, editor de niveles y salas en línea.

    npm install
    npm run dev    # http://localhost:5190
    npm test       # pruebas de física, niveles y red

- `src/core/` física pura, sin gráficos: `athlete`, `control`, `vaults`, `ragdoll`, `world`, `tuning`
- `src/core/levels.js` formato y validación de niveles · `maps.js` niveles incluidos · `run.js` reglas (objetivos, estrellas, meta)
- `src/scene.js` ambientes (gimnasio, parque, azotea) y piezas · `src/camera.js` lateral y tercera persona
- `src/menu.js` menú principal · `src/editor.js` editor 2D y 3D · `src/hud.js` juego
- `src/net/` en línea: `room` (sala), `codec` (posturas), `transport` (Supabase Realtime o pestañas)

En línea: los jugadores se conectan directamente entre sí (WebRTC con Trystero; los relés públicos solo sirven para presentarse). Opcional: `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` para usar Supabase Realtime. `?red=pestanas` prueba salas entre pestañas sin internet.

Se publica solo en GitHub Pages con cada `push` a `main` (`.github/workflows/pages.yml`).
