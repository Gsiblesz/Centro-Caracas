# Panel de producción Centro Caracas

Interfaz estática para la sede Centro en Caracas: tres amasadoras, dos líneas de mesa, fermentadora con carritos simultáneos (temperatura y humedad de cámara compartidas) y tres hornos rotativos con hasta tres productos/lotes por carga. Cada ficha tiene cronómetro, captura de variables y envío doble: Google Sheets vía Apps Script y API propia (centro-caracas-backend.onrender.com) para gráficas de control. La herramienta está pensada para seguir un mismo lote a lo largo de todos sus procesos y medir los tiempos entre etapas.

## Estructura
- index.html: marcado y pestañas.
- styles.css: estilo y layout.
- app.js: lógica de cronómetros, envío dual (Sheets + backend) y manejo de fichas.
- apps-script.gs: endpoint de Apps Script para recibir y guardar en Sheets.

## Configuración rápida
1) Despliega el Apps Script:
   - Abre https://script.google.com, crea un proyecto en blanco, pega el contenido de apps-script.gs.
   - Reemplaza `PASTE_SPREADSHEET_ID` por el ID de tu hoja.
   - Publica como "Aplicación web" con acceso "Cualquiera con el enlace" y copia la URL de despliegue.
2) En app.js reemplaza `PASTE_APPS_SCRIPT_DEPLOYMENT_URL` por la URL copiada.
3) Configura los destinos del backend si cambian:
   - `const BACKEND_URL = 'https://centro-caracas-backend.onrender.com/registros'`
   - `const BACKEND_API_KEY = 'npg_h1wfyYnG2RDz'`
4) Abre index.html en el navegador (o sirve la carpeta con un servidor estático).

## Backend API
- El código del backend Express/Prisma vive en el repositorio independiente [Gsiblesz/Centro-Caracas.Backend](https://github.com/Gsiblesz/Centro-Caracas.Backend.git).
- Ese repo expone la API que consume este panel (`/registros`, `/registros/metrics`, `/registros/control-chart`) y está pensado para desplegarse en Render junto a Neon/Postgres.
- Si necesitas actualizar la API, hazlo allí y redepliega el servicio antes de volver a consumirlo desde este frontend.

## Uso
- Completa los datos de turno (fecha, turno, responsable, ambiente).
- Usa las pestañas: Amasadoras (3), Mesa (2), Fermentadora (agrega tantas fichas como necesites), Horno (1).
- Inicia/pausa/finaliza el cronómetro en cada ficha y guarda; cada envío viaja a Sheets y al backend. El historial local muestra los últimos envíos.
- Revisa la pestaña **Resultados** para filtrar por fechas/proceso, revisar promedios y ver tarjetas con todas las variables/observaciones. Cambia a la vista **Gráficas** para generar las curvas de control (duración, tiempos muertos o total general).

## Notas
- El historial es solo local en el navegador.
- Asegúrate de que el despliegue de Apps Script permita solicitudes anónimas si no usas autenticación.
- Si Render está caído, comenta temporalmente `sendToBackend()` o cambia `BACKEND_URL` para continuar guardando solo en Sheets.
- Las gráficas usan Chart.js (CDN) para reproducir un estilo tipo Analyse-it con CL/UCL/LCL calculados desde el backend.
