"""Configuración por interfaz: un par origen/destino por entrada."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from . import async_get_ssl_context
from .api import EfeApiError, fetch_departures
from .const import (
    CONF_DESTINATION,
    CONF_ORIGIN,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
    STATIONS,
)


def _station_selector() -> SelectSelector:
    return SelectSelector(
        SelectSelectorConfig(
            options=[SelectOptionDict(value=str(k), label=v) for k, v in STATIONS.items()],
            mode=SelectSelectorMode.DROPDOWN,
        )
    )


class EfeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            origin = int(user_input[CONF_ORIGIN])
            destination = int(user_input[CONF_DESTINATION])
            if origin not in STATIONS or destination not in STATIONS:
                errors["base"] = "unknown_station"
            elif origin == destination:
                errors["base"] = "same_station"
            else:
                await self.async_set_unique_id(f"{origin}-{destination}")
                self._abort_if_unique_id_configured()
                try:
                    await fetch_departures(
                        async_get_clientsession(self.hass),
                        await async_get_ssl_context(self.hass),
                        origin,
                        destination,
                    )
                except EfeApiError:
                    errors["base"] = "cannot_connect"
                else:
                    return self.async_create_entry(
                        title=f"{STATIONS[origin]} → {STATIONS[destination]}",
                        data={CONF_ORIGIN: origin, CONF_DESTINATION: destination},
                    )
        schema = vol.Schema(
            {
                vol.Required(CONF_ORIGIN): _station_selector(),
                vol.Required(CONF_DESTINATION): _station_selector(),
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema, user_input or {}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return EfeOptionsFlow()


class EfeOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(
                data={CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL])}
            )
        current = self.config_entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SCAN_INTERVAL, default=current): NumberSelector(
                        NumberSelectorConfig(
                            min=MIN_SCAN_INTERVAL,
                            max=MAX_SCAN_INTERVAL,
                            step=1,
                            unit_of_measurement="s",
                            mode=NumberSelectorMode.BOX,
                        )
                    )
                }
            ),
        )
