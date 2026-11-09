"""Coordinador de actualización de próximos trenes."""

from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import Departures, EfeApiError
from .const import DOMAIN, MAX_BACKOFF
from .hub import EfeHub

_LOGGER = logging.getLogger(__name__)


class EfeCoordinator(DataUpdateCoordinator[Departures]):
    """Consulta un par origen/destino. Si EFE falla, las entidades quedan no disponibles."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        hub: EfeHub,
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
        self._hub = hub
        self._base_interval = interval

    async def _async_update_data(self) -> Departures:
        try:
            data = await self._hub.departures(self.origin, self.destination)
        except EfeApiError as err:
            # Con la fuente caída se consulta cada vez menos, hasta 10 minutos.
            cap = max(self._base_interval, MAX_BACKOFF)
            self.update_interval = min((self.update_interval or cap) * 2, cap)
            raise UpdateFailed(str(err)) from err
        self.update_interval = self._base_interval
        return data
