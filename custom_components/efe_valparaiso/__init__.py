"""EFE Valparaíso: próximos trenes Limache–Puerto."""

from __future__ import annotations

import ssl
from datetime import timedelta
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
import voluptuous as vol
from homeassistant.helpers.typing import ConfigType

from .api import EfeApiError, as_payload, create_ssl_context, resolve_station
from .const import (
    CONF_DESTINATION,
    CONF_ORIGIN,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
    SERVICE_CONSULTAR,
    VERSION,
)
from .coordinator import EfeCoordinator
from .hub import EfeHub

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

CARD_FILE = Path(__file__).parent / "frontend" / "efe-valparaiso-card.js"
CARD_URL = f"/{DOMAIN}/efe-valparaiso-card.js"

CONSULTAR_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_ORIGIN): vol.Any(cv.positive_int, cv.string),
        vol.Required(CONF_DESTINATION): vol.Any(cv.positive_int, cv.string),
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Sirve la tarjeta `custom:efe-valparaiso-card` y la carga en el frontend."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(CARD_FILE), True)]
    )
    # La versión en la URL evita que el navegador use una copia vieja tras actualizar.
    if "frontend" in hass.config.components:
        add_extra_js_url(hass, f"{CARD_URL}?v={VERSION}")

    async def consultar(call: ServiceCall) -> ServiceResponse:
        """Próximos trenes de cualquier par, sin crear dispositivos (lo usa la tarjeta)."""
        origin = resolve_station(call.data[CONF_ORIGIN])
        destination = resolve_station(call.data[CONF_DESTINATION])
        if origin is None or destination is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="unknown_station")
        if origin == destination:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="same_station")
        hub = await async_get_hub(hass)
        try:
            data = await hub.departures(origin, destination)
        except EfeApiError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="source_unavailable"
            ) from err
        return as_payload(data, origin, destination)

    hass.services.async_register(
        DOMAIN,
        SERVICE_CONSULTAR,
        consultar,
        schema=CONSULTAR_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    return True

type EfeConfigEntry = ConfigEntry[EfeCoordinator]


async def async_get_ssl_context(hass: HomeAssistant) -> ssl.SSLContext:
    """Un contexto TLS propio (no se modifica el compartido de Home Assistant)."""
    store = hass.data.setdefault(DOMAIN, {})
    if "ssl_context" not in store:
        store["ssl_context"] = await hass.async_add_executor_job(create_ssl_context)
    return store["ssl_context"]


async def async_get_hub(hass: HomeAssistant) -> EfeHub:
    store = hass.data.setdefault(DOMAIN, {})
    if "hub" not in store:
        store["hub"] = EfeHub(hass, await async_get_ssl_context(hass))
    return store["hub"]


def scan_interval(entry: ConfigEntry) -> timedelta:
    seconds = int(entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL))
    return timedelta(seconds=min(max(seconds, MIN_SCAN_INTERVAL), MAX_SCAN_INTERVAL))


async def async_setup_entry(hass: HomeAssistant, entry: EfeConfigEntry) -> bool:
    coordinator = EfeCoordinator(
        hass,
        entry,
        await async_get_hub(hass),
        int(entry.data[CONF_ORIGIN]),
        int(entry.data[CONF_DESTINATION]),
        scan_interval(entry),
    )
    # Si EFE no responde, Home Assistant reintenta la carga más tarde.
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: EfeConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: EfeConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
