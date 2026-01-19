# Backend Centro-Caracas

API Express + Prisma para recopilar los mismos registros que se envían a Google Sheets y exponer métricas para gráficas de control.

## Requisitos

- Node.js 18+
- Una base de datos PostgreSQL/Neon. Ya existe una URL provista para este proyecto:
  ```
  postgresql://neondb_owner:npg_h1wfyYnG2RDz@ep-falling-glade-ahm58o3b-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
  ```

## Configuración rápida

1. Copia `.env.example` a `.env`: ya trae la URL de Neon `postgresql://neondb_owner:npg_h1wfyYnG2RDz@ep-falling-glade-ahm58o3b-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` y la clave `BACKEND_API_KEY=npg_h1wfyYnG2RDz` que debe viajar en el header `x-api-key`.
2. Instala dependencias:
   ```powershell
   npm install
   ```
3. Genera el cliente Prisma y crea la tabla con el esquema actual (si la base está vacía):
   ```powershell
   npx prisma generate
   npx prisma db push
   ```
   > Si ya existe la tabla `"Registro"`, el comando solo la actualizará sin borrar datos.
4. Inicia el servidor en local:
   ```powershell
   npm run dev
   ```
   El backend queda en `http://localhost:4000` (configurable vía `PORT`).

## Uso de la misma base de datos

- Este backend reutiliza la misma `DATABASE_URL` para que ambos proyectos escriban en Neon. Puedes validar la conexión con:
  ```powershell
  psql "postgresql://..."
  ```
- Cada `POST /registros` guarda todo el payload JSON (campo `data`) y normaliza: panel (`mixers|mesa|fermenter|ovens`), unidad, lote, duración, tiempos muertos y fecha de turno. Así las gráficas pueden consultar sin recalcular.

## Borrar datos actuales

Hay dos maneras equivalentes:

1. **Desde la API** (respeta el middleware de API key):
   ```powershell
   Invoke-RestMethod -Uri https://<tu-backend>/registros -Method DELETE -Headers @{ 'x-api-key' = '<clave>' }
   ```
2. **Directo en Neon/psql**:
   ```sql
   DELETE FROM "Registro";
   VACUUM;
   ```

## Endpoints principales

- `GET /health` → estado del servicio.
- `POST /registros` → guarda el payload completo y campos derivados.
- `GET /registros` → lista con filtros `panel`, `lotId`, `desde`, `hasta`, `take`, `skip`.
- `DELETE /registros` y `DELETE /registros/:id` → limpieza total o puntual.
- `GET /registros/metrics` → promedios/min/máx de duración, tiempos muertos y totales.
- `GET /registros/control-chart?panel=mixers&metric=overallMs` → datos listos para gráficas X̄ con límites LCL/CL/UCL y puntos fuera de control.

## Integración con el frontend

1. Conserva el envío a Apps Script como hoy.
2. En `app.js`, tras `sendToSheets(payload)` añade un `fetch` al backend:
   ```js
   await fetch('https://centro-caracas-backend.onrender.com/registros', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'x-api-key': localStorage.getItem('ccBackendKey') || ''
     },
     body: JSON.stringify(payload)
   });
   ```
3. Usa la pestaña “Gráficas de control” para pedir `GET /registros/control-chart` según panel/métrica y pintar los límites como en Analyse-it.
