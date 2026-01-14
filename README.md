# Panel de producción Centro Caracas

Interfaz estática para la sede Centro en Caracas: tres amasadoras, dos líneas de mesa, fermentadora con carritos simultáneos (temperatura y humedad de cámara compartidas) y tres hornos rotativos con hasta tres productos/lotes por carga. Cada ficha tiene cronómetro, captura de variables y envío a Google Sheets vía Apps Script.

## Estructura
- index.html: marcado y pestañas.
- styles.css: estilo y layout.
- app.js: lógica de cronómetros, envío a Sheets y manejo de fichas.
- apps-script.gs: endpoint de Apps Script para recibir y guardar en Sheets.

## Configuración rápida
1) Despliega el Apps Script:
   - Abre https://script.google.com, crea un proyecto en blanco, pega el contenido de apps-script.gs.
   - Reemplaza `PASTE_SPREADSHEET_ID` por el ID de tu hoja.
   - Publica como "Aplicación web" con acceso "Cualquiera con el enlace" y copia la URL de despliegue.
2) En app.js reemplaza `PASTE_APPS_SCRIPT_DEPLOYMENT_URL` por la URL copiada.
3) Abre index.html en el navegador (o sirve la carpeta con un servidor estático).

## Uso
- Completa los datos de turno (fecha, turno, responsable, ambiente).
- Usa las pestañas: Amasadoras (3), Mesa (2), Fermentadora (agrega tantas fichas como necesites), Horno (1).
- Inicia/pausa/finaliza el cronómetro en cada ficha y guarda para enviar a Sheets. El historial local muestra los últimos envíos.

## Notas
- El historial es solo local en el navegador.
- Asegúrate de que el despliegue de Apps Script permita solicitudes anónimas si no usas autenticación.
