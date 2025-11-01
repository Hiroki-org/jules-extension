# Extensión de Jules para VSCode

![Jules Extension Icon](../jules-extension/icon.png)

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Experimenta el futuro de la codificación con Google Jules en VSCode"

La Extensión de Jules es una extensión que te permite operar el agente de codificación de IA de Google, **Jules**, directamente desde VSCode.
Da la bienvenida a un compañero inteligente a tu flujo de trabajo de codificación.

## ✨ Concepto

Esta extensión fue creada para llevar tu experiencia de desarrollo al siguiente nivel.

- **Integración Perfecta:** Accede a las potentes funciones de Jules sin salir de tu entorno familiar de VSCode.
- **Colaboración en Tiempo Real:** Todo, desde la creación de sesiones de codificación hasta la comprobación del progreso, en tiempo real.
- **Impulso de Productividad:** Deja que Jules maneje las tareas tediosas mientras te concentras en el trabajo creativo.

## 🚀 Características Clave

| Característica                       | Descripción                                                                                                                                                                                                                                                                                     | Comando / Icono                                        |
| :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Configuración de Clave API**       | Configura tu clave de API para conectarte a tu cuenta de Jules en el primer uso. La clave se almacena de forma segura en el SecretStorage de VSCode y se utiliza automáticamente para todas las solicitudes posteriores.                                                                        | `jules-extension.setApiKey`                            |
| **Configuración de Token GitHub**    | Configura tu Token de Acceso Personal de GitHub para habilitar la verificación del estado de PR. El token se almacena de forma segura y se utiliza para detectar automáticamente cuando las solicitudes de extracción se cierran o fusionan, ayudando a mantener limpia tu lista de sesiones.   | `jules-extension.setGithubToken`                       |
| **Gestión de Sesiones**              | Solicita nuevas tareas de codificación a Jules con el comando `> Jules: Create Session`. Las sesiones pasadas también se enumeran, lo que te permite reanudar el trabajo o revisar el historial de tareas completadas en cualquier momento.                                                     | `jules-extension.createSession`                        |
| **Monitoreo en Tiempo Real**         | Ve el estado de trabajo actual de Jules (`Running`, `Active`, `Done`, etc.) de un vistazo en la vista dedicada agregada a la barra lateral. No más cambios entre navegador y editor repetidamente.                                                                                              | `julesSessionsView`                                    |
| **Actualizaciones de Progreso**      | Cuando tengas curiosidad por saber cuánto ha progresado Jules, haz clic en el botón `↻` (actualizar). Recupera y actualiza instantáneamente el estado de la sesión y la lista de actividades más reciente realizada por Jules.                                                                  | `jules-extension.refreshSessions`                      |
| **Visualización de Actividad**       | Cuando selecciones una sesión, puedes verificar los registros detallados de los comandos que Jules ejecutó, archivos editados, procesos de pensamiento y más. Proporciona una experiencia de desarrollo transparente, como si estuvieras mirando dentro del pensamiento de Jules.               | `jules-extension.showActivities`                       |
| **Filtrado Inteligente de Sesiones** | Oculta automáticamente las sesiones completadas (aquellas con PR cerrados/fusionados o estados fallidos/cancelados) de la lista de sesiones. Previene verificaciones de estado innecesarias y mantiene tu espacio de trabajo enfocado en el trabajo activo. Se puede alternar en configuración. | `jules-extension.hideClosedPRSessions` (configuración) |

## 📦 Instalación

Instala desde [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension).

O busca "Jules Extension" en la vista de Extensiones de VS Code.

### Desde el Marketplace (Recomendado)

1.  Busca "Jules Extension" en el Marketplace de VSCode
2.  Haz clic en el botón `Install`

## 🔑 Obtención de una Clave de API

Para usar la Extensión de Jules, necesitas una clave de API de Jules. Sigue estos pasos para obtener una:

1.  **Crea una Cuenta:**

    - Visita el [Sitio Oficial de Jules](https://jules.google/docs).
    - Registra una nueva cuenta o inicia sesión con una cuenta existente.

2.  **Genera una Clave de API:**

    - En el panel de tu cuenta, navega a la sección "Claves de API" o "Configuración de Desarrollador".
    - Haz clic en "Crear Nueva Clave Secreta".
    - Dale a la clave un nombre fácil de entender (p. ej., "Extensión de VSCode") y genérala.

3.  **Copia la Clave:**
    - Se mostrará tu nueva clave de API. Cópiala a tu portapapeles.
    - Si necesitas verificar la clave de nuevo más tarde, siempre puedes verla en la página de configuración de Jules.

> **Importante:** Trata tu clave de API como una contraseña. No la compartas públicamente ni la incluyas en el control de versiones.

## Inicio Rápido

1.  Abre la Paleta de Comandos con `Ctrl + Shift + P` (o `Cmd + Shift + P`).
2.  Ejecuta `> Jules: Set Jules API Key` para configurar tu clave de API.
3.  (Opcional) Ejecuta `> Jules: Set GitHub Token` para habilitar la verificación del estado de PR y el filtrado automático de sesiones.
4.  Haz clic en el icono `$(robot)` en la barra lateral para abrir la Vista de Sesiones de Jules.
5.  Ejecuta `> Jules: Create Jules Session` para iniciar tu primera sesión de codificación!

## 📚 Referencias

- [Sitio Oficial de Jules](https://jules.google/docs)
- [Documentación de la API de Jules](https://developers.google.com/jules/api)

## 🤝 Contribución

Este proyecto acaba de empezar. ¡Agradecemos todas las formas de contribución, incluidos informes de errores, sugerencias de funciones y pull requests!
Por favor, consulta el Rastreador de Problemas y los Pull Requests.

## � Enlaces

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [Repositorio de GitHub](https://github.com/is0692vs/jules-extension.git)
- [Reportar Problemas](https://github.com/is0692vs/jules-extension/issues)

## 📝 Licencia

[MIT](../../LICENSE)
