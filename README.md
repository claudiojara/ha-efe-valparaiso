# EFE Valparaíso para Home Assistant 🚆

Integración (instalable con HACS) que muestra los **próximos trenes** entre dos estaciones de la línea
Limache–Puerto de EFE Valparaíso. Usa la misma fuente pública de «Próximos trenes» que la app de EFE,
sin cuenta ni claves.

> Proyecto no oficial, sin relación con EFE. La API no está documentada para terceros y puede cambiar
> o dejar de responder sin aviso.

## Instalación

1. HACS → ⋮ → *Repositorios personalizados* → pega la URL de este repositorio, categoría **Integración**.
2. Instala *EFE Valparaíso* y reinicia Home Assistant.
3. *Ajustes → Dispositivos y servicios → Añadir integración → EFE Valparaíso*.
4. Elige estación de origen y de destino. Para el otro sentido, añade la integración otra vez con el par invertido.

En *Configurar* puedes cambiar el intervalo de consulta (60 s por defecto, mínimo 30 s). Cada
instalación consulta directamente a EFE: por favor no lo bajes sin necesidad.

## Entidades

Por cada par se crea un dispositivo, por ejemplo *EFE Villa Alemana → Puerto*:

| Entidad | Estado | Notas |
|---|---|---|
| `sensor.efe_<origen>_<destino>_proximo_tren` | Texto de EFE para el primer tren: `8 minutos`, `cercano`… o `Sin servicios informados` | Ver atributos |
| `sensor.efe_<origen>_<destino>_servicios_informados` | Cantidad de servicios que informó EFE | `0` es una lista vacía, no una caída |

Los ids dependen del idioma con que se crearon (en inglés: `..._next_train`, `..._reported_services`).

Atributos de *Próximo tren*:

- `origen`, `destino`, `consultado_en`: el par configurado y la hora de la última consulta a EFE.
- `hasta`, `tipo`, `id_servicio`: tal como los entrega EFE. **Respeta `hasta`**: hacia Limache también
  aparecen trenes cortos «Hasta Sargento Aldea».
- `llega_a_destino`: si el primer tren pasa por tu destino, calculado con el orden de las estaciones
  (Puerto = 1 … Limache = 21). Un tren «Hasta Sargento Aldea» no llega a Limache, pero sí a La Concepción.
- `hora_estimada`: hora de la consulta más los minutos que informó EFE; `null` con «cercano».
- `minutos`: número solo cuando EFE dice explícitamente «N minutos»; con «cercano» es `null`. No se
  inventan tiempos.
- `servicios`: lista completa (`hasta`, `tipo`, `tiempo`, `idServicio` tal como llegan, más `minutos`,
  `hora_estimada`, `estacion_final` y `llega_a_destino`). No se guarda en el historial.
- `estado_consulta`: `servicios_informados` o `sin_servicios_informados`.
- `aviso_efe`, `operabilidad`: avisos que acompañan la respuesta de EFE. La advertencia «Servicio no
  disponible por el momento» aparece incluso con trenes circulando y ambas vías en `YES`; no la uses sola
  para decidir que hay una caída.
- `tiempo_real_confirmado`: siempre `false`. Los minutos disminuyen entre consultas, pero no está
  confirmado si vienen de la posición real de los trenes o de una cuenta regresiva programada.

### Qué significa cada estado

- **Hay servicios**: EFE respondió con trenes.
- **Sin servicios informados / 0**: EFE respondió correctamente con una lista vacía (por ejemplo, de
  madrugada). No garantiza que no haya trenes.
- **No disponible**: no se pudo consultar a EFE o cambió el formato. No se muestra una lista vacía ni datos
  antiguos en su lugar; se reintenta con espera creciente, hasta 10 minutos.

## Tarjeta `custom:efe-valparaiso-card`

La integración trae su propia tarjeta; no hay que instalar nada más. Muestra uno o dos trayectos lado a lado
(por ejemplo ida y vuelta) con minutos, hora estimada, unidad simple/doble y los trenes siguientes. Los trenes
que no llegan a tu destino quedan marcados con su estación final. Al tocar un trayecto se ve la lista completa.

Se configura con el **editor visual** (estaciones en desplegables) o en YAML:

```yaml
type: custom:efe-valparaiso-card
titulo: Trabajo                 # opcional
trayectos:
  - origen: La Concepción       # cualquier par de estaciones (nombre o ID 1–21)
    destino: Francia
  - origen: Francia
    destino: La Concepción
    nombre: Vuelta              # opcional
actualizacion: auto             # auto | manual (también se cambia en la tarjeta)
intervalo: 60                   # segundos entre consultas en automático, mínimo 30
editable: true                  # tocar el nombre del trayecto para cambiar estaciones
```

**Dos carriles independientes.** Los trayectos por estación se consultan con el servicio
`efe_valparaiso.consultar`, bajo demanda: no crean dispositivos ni tocan tus sensores o automatizaciones.
Los dispositivos que configuras en la integración (y sus sensores) siguen siendo los que usan tus
automatizaciones. Ambos comparten una caché de 20 s por par, así que no se duplican consultas a EFE.

- **Automático:** consulta cada `intervalo` segundos **solo mientras la tarjeta está visible** en pantalla.
  Si nadie mira el panel, no consulta.
- **Manual:** consulta una vez al abrir y luego solo con el botón Actualizar. El botón Auto/Manual de la tarjeta
  cambia el modo y lo recuerda en ese navegador.
- **Cambiar el trayecto en la tarjeta:** toca el nombre del trayecto (⇄), elige otras estaciones o invierte el
  sentido. El cambio queda guardado solo en ese navegador; «Volver al configurado» lo deshace.
- **Datos antiguos:** si la última consulta tiene 2 minutos o más, los números se ven atenuados y la tarjeta
  dice «Dato de hace N min».
- **Un sensor en vez de estaciones:** `- entity: sensor.efe_villa_alemana_puerto_proximo_tren` muestra exactamente
  lo que ve ese sensor. Con `modo: input_boolean.x`, el botón Auto/Manual cambia ese helper (útil si tus
  automatizaciones lo usan para decidir cuándo actualizar los sensores).

Para que la tarjeta y el servicio existan, la integración tiene que tener **al menos un dispositivo
configurado**.

### Servicio `efe_valparaiso.consultar`

```yaml
action: efe_valparaiso.consultar
data:
  origen: Villa Alemana
  destino: Limache
response_variable: trenes
```

Devuelve `origen`, `destino`, `consultado_en`, `estado_consulta`, `aviso_efe`, `operabilidad`,
`tiempo_real_confirmado: false` y `servicios` (con `estacion_final`, `llega_a_destino`, `minutos` y
`hora_estimada`). Si EFE no responde, falla con un error (no devuelve una lista vacía).

### Modo manual de los sensores (opcional)

Para que los **sensores** no consulten a EFE fuera de un horario, desactiva el sondeo de sus entradas
(*⋮ → Opciones del sistema → Habilitar sondeo*) y actualízalos con una automatización:

```yaml
triggers:
  - trigger: time_pattern
    minutes: "/1"
conditions:
  - condition: time
    after: "06:00:00"
    before: "23:30:00"
actions:
  - action: homeassistant.update_entity
    target:
      entity_id: sensor.efe_villa_alemana_puerto_proximo_tren
```

## Otros ejemplos

Tarjeta estándar:

```yaml
type: entities
title: Villa Alemana → Puerto
entities:
  - entity: sensor.efe_villa_alemana_puerto_proximo_tren
    secondary_info: last-updated
  - type: attribute
    entity: sensor.efe_villa_alemana_puerto_proximo_tren
    attribute: hasta
```

Aviso cuando falten 10 minutos o menos (solo si EFE informa minutos):

```yaml
triggers:
  - trigger: template
    value_template: >
      {% set m = state_attr('sensor.efe_villa_alemana_puerto_proximo_tren', 'minutos') %}
      {{ m is number and m <= 10 }}
actions:
  - action: notify.notify
    data:
      message: >
        Tren {{ state_attr('sensor.efe_villa_alemana_puerto_proximo_tren', 'hasta') }}
        en {{ states('sensor.efe_villa_alemana_puerto_proximo_tren') }}
```

## TLS

El servidor de EFE entrega solo su certificado de hoja, sin la cadena intermedia. La integración incluye el
certificado intermedio **público** «GlobalSign GCC R46 AlphaSSL CA 2025» (vence en junio de 2029) y lo
añade a las raíces de confianza en un contexto TLS propio. La verificación de cadena, vigencia y nombre
**sigue activa**; nunca se desactiva. Si EFE cambia de proveedor de certificados, la integración quedará
no disponible hasta actualizarla.

## Desarrollo

```bash
pip install pytest-homeassistant-custom-component
pytest
```

Las pruebas usan respuestas reales de EFE guardadas en `tests/fixtures`.

Licencia: MIT.
