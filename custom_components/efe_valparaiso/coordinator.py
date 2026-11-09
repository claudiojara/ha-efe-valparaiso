"""Coordinador de actualización de próximos trenes."""

from __future__ import annotations

import logging
import ssl
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import Departures, EfeApiError, fetch_departures
from .const import DOMAIN, MAX_BACKOFF

_LOGGER = logging.getLogger(__name__)


class EfeCoordinator(DataUpdateCoordinator[Departures]):
    """Consulta un par origen/destino. Si EFE falla, las entidades quedan no disponibles."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        ssl_context: ssl.SSLContext,
        origin: int,
        destination: int,
        interval: timedelta,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN}_{origin}_{destination}",
            update_interval=interval,
        )
        self.origin = origin
        self.destination = destination
        self._ssl_context = ssl_context
        self._base_interval = interval

    async def _async_update_data(self) -> Departures:
        try:
            data = await fetch_departures(
                async_get_clientsession(self.hass),
                self._ssl_context,
                self.origin,
                self.destination,
                dt_util.now(),
            )
        except EfeApiError as err:
            # Con la fuente caída se consulta cada vez menos, hasta 10 minutos.
            cap = max(self._base_interval, MAX_BACKOFF)
            self.update_interval = min((self.update_interval or cap) * 2, cap)
            raise UpdateFailed(str(err)) from err
        self.update_interval = self._base_interval
        return data
