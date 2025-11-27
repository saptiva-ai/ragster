# 🛣️ Roadmap de Mejoras Técnicas (Post-Auditoría)

Basado en el estado actual tras los arreglos de infraestructura y seguridad (`fix/infra-and-security`), estas son las siguientes prioridades recomendadas:

## 🚀 Fase 1: Operatividad y Despliegue (Prioridad Alta)

### 1. CI/CD Pipeline (GitHub Actions)
**Objetivo:** Automatizar el despliegue a `ragster.saptiva.com` para evitar procesos manuales propensos a errores.
- **Tareas:**
  - [ ] Configurar secretos en GitHub Repo (SSH Key, Host, Docker Registry).
  - [ ] Crear workflow `.github/workflows/deploy.yml`.
  - [ ] Pipeline: Build Docker Image -> Push to GHCR -> SSH Deploy en servidor.
- **Valor:** Agilidad. Cualquier fix se despliega en minutos sin intervención humana.

### 2. Branding y UX Feedback
**Objetivo:** Profesionalizar la apariencia para la demo.
- **Tareas:**
  - [ ] Actualizar Favicon (`.ico`) y Metadata (Títulos, Descripción) a Saptiva.
  - [ ] Implementar sistema de notificaciones (Toasts) para reemplazar `console.log` de errores.
    - *Ej: "Archivo subido correctamente" (Verde) vs "Error al procesar PDF" (Rojo).*
- **Valor:** Percepción de calidad y usabilidad.

---

## 🧠 Fase 2: Potencia del RAG (Diferenciadores)

### 3. Integración OCR Saptiva
**Objetivo:** Permitir indexar documentos escaneados o imágenes, superando la limitación actual de solo texto plano/PDFs digitales.
- **Tareas:**
  - [ ] Modificar `SaptivaService` para incluir método `extractText(file)`.
  - [ ] Actualizar `upload-weaviate/route.ts` para usar el OCR en lugar de `mammoth`/`pdf-parse`.
- **Valor:** Capacidad de procesar facturas, contratos escaneados y manuales antiguos.

### 4. Memoria de Conversación (Chat History)
**Objetivo:** Que el bot recuerde lo que se dijo 3 turnos atrás.
- **Tareas:**
  - [ ] Mejorar la inyección de historial en el prompt (actualmente es muy básica).
  - [ ] Asegurar que el historial recuperado sea del mismo `userId` y `sessionId`.
- **Valor:** Conversaciones naturales y seguimiento de contexto.

---

## 🛠️ Fase 3: Deuda Técnica y Mantenibilidad

### 5. Refactorización y Centralización
**Objetivo:** Eliminar código duplicado y credenciales dispersas.
- **Tareas:**
  - [ ] Unificar llamadas a API en `src/lib/services/saptiva.ts` (Embeddings, Chat, OCR).
  - [ ] Eliminar uso directo de `axios` y variables de entorno en controladores (`route.ts`).
- **Valor:** Estabilidad. Si cambia una API Key, se cambia en un solo lugar.

### 6. Lazy MCP (Modular Context Protocol)
**Objetivo:** Preparar la arquitectura para el futuro (herramientas modulares).
- **Tareas:**
  - [ ] Definir interfaz para "Tools" (ej. Búsqueda Web, Cálculo, Consulta SQL).
  - [ ] Implementar dispatcher que decida si llamar al LLM o a una Tool.
- **Valor:** Extensibilidad futura.
