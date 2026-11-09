"""EFE Valparaíso: próximos trenes Limache–Puerto."""

from __future__ import annotations

import ssl
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .api import create_ssl_context
from .const import (
    CONF_DESTINATION,
    CONF_ORIGIN,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
)
from .coordinator import EfeCoordinator

PLATFORMS = [Platform.SENSOR]

type EfeConfigEntry = ConfigEntry[EfeCoordinator]


async def async_get_ssl_context(hass: HomeAssistant) -> ssl.SSLContext:
    """Un contexto TLS propio (no se modifica el compartido de Home Assistant)."""
    store = hass.data.setdefault(DOMAIN, {})
    if "ssl_context" not in store:
        store["ssl_context"] = await hass.async_add_executor_job(create_ssl_context)
    return store["ssl_context"]


def scan_interval(entry: ConfigEntry) -> timedelta:
    seconds = int(entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL))
    return timedelta(seconds=min(max(seconds, MIN_SCAN_INTERVAL), MAX_SCAN_INTERVAL))


async def async_setup_entry(hass: HomeAssistant, entry: EfeConfigEntry) -> bool:
    coordinator = EfeCoordinator(
        hass,
        entry,
        await async_get_ssl_context(hass),
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
