# ai-pdf-editor

Editor web de PDF con parches generados por IA, construido con **TanStack Start, React y fal.ai**. La interfaz se presenta como **Parche**.

Permite abrir un PDF, seleccionar una zona de texto, escribir su sustitución y generar una imagen que reconstruye esa región. Por ejemplo: seleccionar «Pablito» y sustituirlo por «Roberto», intentando conservar el estilo y el fondo originales.

**El documento completo permanece en el navegador.** Solo el recorte confirmado, el texto de sustitución y las indicaciones de edición se envían al servidor y a fal.ai.

> No es un editor de objetos de texto del PDF ni una herramienta de OCR. Las letras nuevas son imágenes generadas por IA. Al exportar, las páginas modificadas se convierten en imágenes para que el texto original no permanezca oculto debajo del parche.

## Contenido

- [Funciones principales](#funciones-principales)
- [Requisitos](#requisitos)
- [Instalación y configuración](#instalación-y-configuración)
- [Cómo usar el editor](#cómo-usar-el-editor)
- [Precisión y límites](#precisión-y-límites)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Almacenamiento local](#almacenamiento-local)
- [Exportación a PDF](#exportación-a-pdf)
- [Arquitectura](#arquitectura)
- [Desarrollo y pruebas](#desarrollo-y-pruebas)
- [Solución de problemas](#solución-de-problemas)

## Funciones principales

- Abrir un PDF desde el selector de archivos o arrastrarlo sobre la aplicación.
- Navegar por documentos con varias páginas y ajustar el zoom.
- Dibujar selecciones rectangulares con una vista previa del recorte.
- Ampliar la región antes de enviarla a la IA, sin añadir datos de otras zonas.
- Sustituir texto mediante el modelo `fal-ai/nano-banana-2/edit`.
- Revisar, aplicar o descartar el resultado antes de incorporarlo al documento.
- Crear varios parches independientes.
- Seleccionar, mover, regenerar y eliminar un parche aplicado.
- Dar feedback para corregir tipografía, trazos o alineación.
- Ajustar el movimiento con el teclado y deshacer operaciones.
- Guardar el documento y los parches aplicados en IndexedDB.
- Exportar un nuevo PDF desde el navegador.

## Requisitos

- **Bun** reciente, para instalar dependencias y ejecutar los scripts.
- **Node.js 20.19.x o una versión >= 22.12.0**, de acuerdo con los requisitos de Vite 7.
- Un navegador moderno compatible con Canvas, Web Workers, IndexedDB y `Promise.withResolvers`.
- Una cuenta de [fal.ai](https://fal.ai/) con una API key válida y saldo disponible para las generaciones.
- Conexión a Internet para usar la IA. La apertura del PDF y la preparación del recorte ocurren localmente, pero esta aplicación no está configurada como una PWA sin conexión.

No requiere Docker, PostgreSQL, Redis ni una base de datos en el servidor.

## Instalación y configuración

### 1. Descargar el proyecto

```bash
git clone https://github.com/leobar37/ai-pdf-editor.git
cd ai-pdf-editor
bun install --frozen-lockfile
```

### 2. Configurar fal.ai

Crea `.env.local` a partir de la plantilla. Si ya existe, conserva su contenido:

```bash
cp -n .env.example .env.local
chmod 600 .env.local
```

Edita el archivo y configura:

```dotenv
FAL_KEY=tu_api_key_de_fal
```

`tu_api_key_de_fal` es un marcador: reemplázalo por tu propia credencial.

- La clave se usa únicamente en el servidor.
- No la nombres `VITE_FAL_KEY`: las variables `VITE_*` pueden quedar expuestas al cliente.
- `.env.local` está excluido de Git. La plantilla `.env.example` sí se versiona.
- Reinicia el proceso de desarrollo después de cambiar la credencial.
- También se admite `FAL_KEY` como variable del entorno del proceso; tiene prioridad sobre el valor cargado desde los archivos de entorno.

Sin una clave válida puedes abrir documentos y preparar recortes, pero no generar nuevos parches con IA.

### 3. Iniciar el editor

```bash
bun run dev
```

El servidor utiliza el **puerto 3025**, escucha en **`0.0.0.0`** y no cambia automáticamente de puerto si este está ocupado.

Para acceder desde otro dispositivo mediante Tailscale, ambos dispositivos deben estar conectados a la misma tailnet. Obtén la dirección del servidor:

```bash
tailscale ip -4
ss -tlnp 'sport = :3025'
```

Puedes generar el enlace con:

```bash
TAILSCALE_IP="$(tailscale ip -4)"
printf 'http://%s:3025/\n' "$TAILSCALE_IP"
```

Abre el enlace resultante en el navegador. Si Tailscale no está instalado o no devuelve una IP, configura ese acceso antes de compartir el enlace.

**Importante:** escuchar en todas las interfaces también permite conexiones por otras redes accesibles al equipo. No expongas este servidor de desarrollo directamente a Internet.

## Cómo usar el editor

### Crear un parche

1. Arrastra tu PDF sobre la aplicación o abre el selector de archivos.
2. Navega hasta la página que quieres modificar.
3. Pulsa **Nuevo parche**.
4. Dibuja un rectángulo alrededor del texto. Evita incluir información que no quieras enviar.
5. Revisa la vista previa del recorte.
6. Escribe el **Texto de sustitución**.
7. Elige la **Ampliación del recorte**: 2×, 3× o 4×. El valor inicial es 3×; el tamaño efectivo se ajusta a los límites de resolución.
8. Si hace falta, añade indicaciones en **Feedback para regenerar**.
9. Marca la confirmación de envío a fal.ai.
10. Pulsa **Generar parche** y espera el resultado.
11. Revisa la vista previa y pulsa **Aplicar parche**, o descártalo.

Cada generación utiliza créditos de tu cuenta de fal.ai. Descartar una imagen ya generada no revierte ese consumo.

La confirmación se desmarca al cambiar el texto, el feedback o el recorte, para que puedas revisar qué vas a enviar antes de una nueva petición.

### Editar varios textos

Después de aplicar un resultado, pulsa **Nuevo parche** y selecciona otra región. Los parches anteriores permanecen en el documento y aparecen en **Parches aplicados**, con su página correspondiente.

Conviene usar selecciones pequeñas y separadas para textos con estilos distintos. Una selección nueva se prepara a partir de la vista actual de la página; si incluye un parche anterior, esos píxeles también forman parte del recorte.

### Regenerar con feedback

1. Selecciona un parche desde **Parches aplicados** o desde la página en modo **Mover / seleccionar parches**.
2. Ajusta el texto o escribe feedback, por ejemplo:
   - «Mantén la misma fuente serif».
   - «Los trazos deben ser más finos».
   - «Respeta la línea base y el color originales».
3. Confirma de nuevo el envío.
4. Pulsa **Regenerar parche**.
5. Revisa el candidato y aplícalo.

La regeneración usa el **recorte de referencia guardado al crear el parche**, no la imagen de la última generación. Al aplicarla, reemplaza ese parche sin duplicarlo y conserva su posición actual, incluso si lo habías movido.

### Mover un parche

Activa **Mover / seleccionar parches** y arrastra el parche dentro de su página. El movimiento conserva sus dimensiones y se limita a los bordes de la página.

Para no hacer reaparecer el texto antiguo en el origen:

- En regiones con fondo uniforme detectado, se prepara un fondo limpio localmente.
- Si no hay un fondo limpio disponible, primero debes seleccionar el parche, confirmar el envío y pulsar **Preparar fondo para mover (IA)**.
- Esa preparación es otra generación de fal.ai y consume créditos.

Con el foco de teclado sobre un parche y el modo mover activo:

| Tecla | Acción |
| --- | --- |
| Flechas | Mover 1 píxel visual en la dirección indicada. |
| `Shift` + flechas | Mover 10 píxeles visuales. |
| `Enter` o espacio | Seleccionar el parche para editarlo. |

El desplazamiento se convierte a coordenadas relativas a la página, de modo que el tamaño del parche no depende del zoom.

### Eliminar o deshacer

- **Eliminar este parche** retira el parche seleccionado.
- **Deshacer último** revierte operaciones de aplicación, sustitución, movimiento o eliminación durante la sesión.
- Se conservan hasta 30 estados anteriores en memoria. Este historial no se guarda en IndexedDB.
- Después de recargar, o cuando ya no quedan estados anteriores, **Deshacer último** retira el último parche de la lista actual; no recupera un historial de movimientos antiguo.

Aplica o descarta los candidatos pendientes antes de exportar. Una vista previa todavía no aplicada no forma parte del PDF final.

## Precisión y límites

### Cómo se conserva la referencia

El editor analiza los píxeles del recorte para detectar un fondo suficientemente uniforme y el rectángulo ocupado por la tinta. Cuando puede aislarlos:

1. Envía al modelo las dimensiones y posición de ese rectángulo, además de los colores de referencia.
2. Solicita mantener la tipografía, el grosor, la línea base y la composición.
3. Ajusta localmente el ancho, alto, posición y colores del resultado a la referencia original.
4. Muestra las medidas del texto en milímetros cuando dispone de las dimensiones de la página.

Estas medidas proceden de la imagen renderizada, **no de una extracción de la fuente o de las métricas tipográficas vectoriales del PDF**.

**Una fuente idéntica no está garantizada.** La IA reconstruye los glifos; el ajuste geométrico no convierte esos glifos en la fuente original. Fondos con textura, fotografías, texto muy pequeño o varios estilos en una misma selección pueden reducir la precisión.

Si el texto nuevo es mucho más largo, mantener el mismo ancho y alto puede alterar sus proporciones. Usa una sustitución de longitud similar cuando necesites un parecido tipográfico más estricto.

### Límites actuales

| Elemento | Límite o comportamiento |
| --- | --- |
| Archivo PDF | Hasta 50 MiB; la interfaz lo anuncia como 50 MB. |
| Selección | Como máximo el 30 % del área de una página, validado en el navegador. |
| Selección mínima | 6 × 6 píxeles en la imagen renderizada usada para recortar. |
| Imagen enviada | PNG con dimensiones de hasta 2048 × 2048 píxeles. |
| Ampliación | Lado mayor del contenido ajustado entre 1024 y 2048 píxeles. Puede añadir márgenes blancos, nunca píxeles vecinos del PDF. |
| Texto de sustitución | Hasta 500 caracteres. |
| Feedback | Hasta 500 caracteres en la interfaz; el contrato del servidor admite hasta 1000. |
| Generaciones | Una activa por proceso de servidor y hasta 6 solicitudes admitidas por minuto, compartidas entre clientes. |
| Espera de una edición | Hasta 180 segundos; después se intenta cancelar la petición al proveedor. |
| Documentos guardados | Un borrador actual por origen y perfil de navegador. |

Los límites de concurrencia y frecuencia viven en memoria: no son una cuota por usuario ni un control distribuido entre varios servidores.

No se admite introducir contraseñas para desbloquear PDFs. Utiliza una copia desbloqueada y con permisos para editar.

## Privacidad y seguridad

### Qué datos salen del navegador

| Dato | Destino |
| --- | --- |
| PDF completo | Memoria e IndexedDB del navegador; no se envía al servidor. |
| Nombre del archivo y página actual | Estado y borrador local; no forman parte de la petición de edición. |
| Recorte PNG confirmado | Servidor de TanStack Start y fal.ai, junto con su proveedor de IA. |
| Texto nuevo, feedback y referencia visual | Servidor y fal.ai como instrucciones de edición. |
| Resultado generado | Regresa al navegador; se guarda localmente al aplicar el parche. |
| PDF exportado | Se genera y descarga en el navegador. |

El servidor recibe únicamente los campos admitidos por un esquema estricto. Acepta un recorte PNG en una data URL, no un PDF ni una URL de entrada arbitraria; comprueba su firma y dimensiones.

La selección se redondea hacia dentro para no incluir píxeles de fuera de la región marcada. Si necesita más espacio para procesar una línea estrecha, se añade relleno blanco.

### Preferencias enviadas a fal.ai

La integración utiliza:

- `X-Fal-Store-IO: 0`, para solicitar que no se guarde el historial de entradas y salidas.
- Una preferencia de expiración de archivos de 300 segundos.
- `sync_mode: true`, para recibir el PNG como data URL; no se aceptan resultados que requieran descargar una imagen desde una URL de CDN.
- `X-Fal-No-Retry: 1`, búsqueda web desactivada y fallback desactivado.

También valida que las URLs de seguimiento y cancelación pertenezcan a la cola esperada de fal.ai y rechaza redirecciones.

**Estas preferencias no equivalen a una garantía de retención cero en fal.ai ni en su proveedor de IA.** El propio recorte puede contener datos sensibles. Revisa las condiciones del proveedor antes de enviarlo y selecciona solo la información necesaria.

### Acceso al servidor y credenciales

La aplicación **no incluye autenticación ni gestión de usuarios**. La comprobación del origen de la petición no sustituye un control de acceso: alguien con acceso al servicio podría consumir créditos de la clave configurada.

- Úsala en un entorno de confianza y restringe el acceso con firewall o reglas de tu tailnet.
- Para exponerla a Internet hacen falta autenticación, HTTPS y límites de uso adecuados.
- No publiques `.env.local` ni valores reales de `FAL_KEY`.
- IndexedDB no está cifrado por la aplicación: protege el dispositivo y el perfil del navegador.
- Este proyecto no implementa un servicio de almacenamiento de documentos ni una base de datos de backend.

## Almacenamiento local

El editor utiliza la base IndexedDB `pdf-patch-local`, con un único borrador actual. Guarda:

- El nombre y los bytes originales del PDF.
- Los parches **aplicados**, sus imágenes, posiciones, fondos y recortes de referencia.
- El feedback asociado al parche aplicado.
- La página actual.

Al recargar recupera ese borrador en el mismo navegador y origen. Cambiar de dispositivo, perfil, hostname, protocolo o puerto implica acceder a un almacenamiento distinto.

Abrir otro PDF reemplaza el borrador actual. Exporta el anterior si quieres conservarlo. Las selecciones pendientes, candidatos no aplicados y el historial de deshacer no se recuperan al recargar.

El almacenamiento del navegador puede fallar por falta de espacio o restricciones del perfil, y puede borrarse al limpiar los datos del sitio. No lo uses como única copia de respaldo.

**Borrar datos locales** solicita confirmación y elimina el borrador del editor. No borra el archivo original de tu equipo, los PDFs ya descargados ni datos que pudiera conservar el proveedor de IA.

## Exportación a PDF

Pulsa **Exportar PDF** para descargar `<nombre>-editado.pdf`.

- **Páginas con parches:** se renderizan completas con los fondos y parches aplicados y se incorporan como imágenes a un PDF nuevo. El texto y las anotaciones originales de esas páginas no quedan debajo de una superposición.
- **Páginas sin parches:** se copian desde el original, conservando su contenido, dimensiones y rotación. No se promete una copia idéntica byte a byte.
- El render de exportación utiliza una escala de hasta 3×, limitada a 3200 píxeles en el lado mayor.

Consecuencias:

- En una página modificada, **todo el texto**, no solo el sustituido, deja de ser seleccionable o buscable como texto.
- Los enlaces, formularios y anotaciones interactivas de una página rasterizada no se conservan como elementos interactivos.
- La calidad al ampliar o imprimir depende de la resolución de la imagen.
- No está diseñado para preservar firmas digitales ni garantizar su validez.
- No es una herramienta de anonimización integral: las páginas sin cambios siguen conservando su información.

Conserva siempre el original y revisa visualmente el archivo descargado.

## Arquitectura

### Flujo de edición

```text
PDF local
  |
  v
PDF.js + Canvas en el navegador
  |
  +--> IndexedDB: documento y parches aplicados
  |
  v
Selección -> recorte PNG ampliado + referencia + instrucciones
  |
  v
Server function de TanStack Start
  | validación, límites y FAL_KEY solo en servidor
  v
Cola de fal.ai: nano-banana-2/edit
  |
  v
PNG generado -> ajuste local -> vista previa -> aplicar parche
  |
  v
Render de páginas modificadas + pdf-lib -> PDF descargable
```

### Tecnologías

| Tecnología | Responsabilidad |
| --- | --- |
| TanStack Start / Router | Aplicación con SSR, rutas y funciones de servidor. |
| React 19 | Interfaz y estado del editor. |
| TanStack Query | Estado de configuración y operaciones de generación. |
| PDF.js (`pdfjs-dist`) | Lectura y render del PDF en Canvas con un worker. |
| `pdf-lib` | Creación del PDF exportado y copia de páginas sin cambios. |
| Zod | Validación del contrato de edición y respuestas del proveedor. |
| fal.ai | Generación de la región editada o del fondo limpio. |
| IndexedDB | Persistencia del borrador en el navegador. |
| Vite / TypeScript / Vitest | Desarrollo, build, tipos y pruebas. |

PDF.js se importa dinámicamente desde el editor: necesita APIs de navegador y no debe ejecutarse durante el render del servidor.

### Estructura

```text
src/
  routes/
    __root.tsx             Documento HTML y proveedores de la aplicación
    index.tsx              Ruta del editor
  features/editor/
    PdfEditor.tsx          Interfaz y coordinación del flujo
    edit-contract.ts      Esquemas y construcción del input de fal.ai
    edit.server.ts        Cola de fal.ai, límites y validación de resultados
    server-functions.ts   Estado de configuración y función de edición
    geometry.ts           Selección, coordenadas y plan de ampliación
    pdf-browser.ts        Render, recortes y extracción de parches
    patch-alignment.ts    Referencia de tinta, geometría y colores
    patch-state.ts        Operaciones independientes de los parches
    local-store.ts        Lectura, guardado y borrado de IndexedDB
    pdf-export.ts         Exportación del documento
  router.tsx              Configuración del router
  routeTree.gen.ts        Árbol de rutas generado por TanStack
  styles.css              Estilos de la interfaz
tests/                    Pruebas unitarias e integración con mocks
.env.example              Plantilla sin credenciales
bun.lock                  Versiones bloqueadas de las dependencias
vite.config.ts            Plugins, puerto y carga de FAL_KEY
vitest.config.ts          Configuración de pruebas
```

## Desarrollo y pruebas

| Comando | Uso |
| --- | --- |
| `bun run dev` | Desarrollo en el puerto 3025. |
| `bun run typecheck` | Comprobar tipos sin emitir archivos. |
| `bun run test` | Ejecutar Vitest con un máximo de 2 workers. |
| `bun run build` | Generar el build de cliente y servidor en `dist/`. |
| `bun run preview` | Ejecutar el script de vista previa del build en el puerto 3025. |

Para validar cambios:

```bash
bun run test
bun run typecheck
bun run build
```

Las pruebas cubren geometría y límites de selección, contratos de privacidad, manejo de respuestas y errores de fal.ai, alineación, varios parches, movimiento, IndexedDB y exportación. Las llamadas al proveedor se simulan: **la suite no necesita una credencial real ni consume créditos de fal.ai**.

Para revisar el build, detén primero el servidor de desarrollo: `dev` y `preview` utilizan el mismo puerto. No hay un script `start` de producción ni un despliegue con autenticación configurado; `preview` no sustituye esa preparación.

## Solución de problemas

| Problema | Qué comprobar |
| --- | --- |
| Generar está deshabilitado | Selecciona un recorte, escribe un texto, confirma el envío y comprueba que el servidor tenga `FAL_KEY`. Espera si hay otra operación en curso. |
| Falta configurar `FAL_KEY` | Revisa `.env.local` o el entorno del proceso y reinicia el servidor. No uses el prefijo `VITE_`. |
| fal.ai rechaza la credencial | Verifica la clave y el acceso al modelo. No pegues la credencial en capturas o reportes públicos. |
| No se inicia la edición | Comprueba saldo, disponibilidad del proveedor y conectividad. |
| Demasiadas solicitudes | Espera a que termine la edición activa o a que pase la ventana de un minuto. |
| La edición tarda demasiado | Se intenta cancelarla, pero el proveedor podría haber comenzado a procesar y cobrar. Revisa antes de repetir. |
| El recorte es demasiado grande o pequeño | Selecciona una región dentro de la página que respete los límites indicados. |
| No se parece a la fuente original | Usa un recorte de un solo estilo, feedback más específico y texto de longitud similar. Revisa antes de aplicar; la fuente exacta no está garantizada. |
| No se puede mover el parche | Selecciónalo y prepara su fondo limpio cuando aparezca la opción correspondiente. |
| No se puede guardar o recuperar | Revisa el espacio y permisos del navegador. Si está bloqueado el almacenamiento, cierra otras pestañas del editor. |
| El borrador no aparece en otro dispositivo | IndexedDB no se sincroniza. Debes usar el mismo perfil y origen, o abrir el PDF en el nuevo dispositivo. |
| PDF protegido con contraseña | Abre una copia desbloqueada. El editor no tiene un flujo para introducir contraseñas. |
| El puerto 3025 está ocupado | Detén el proceso que lo ocupa o ajusta `vite.config.ts` y el script `preview` de forma coherente. |
| Exportar está deshabilitado | Aplica o descarta el candidato pendiente y espera a que termine cualquier operación en curso. |
