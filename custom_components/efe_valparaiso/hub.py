"""Acceso compartido a EFE: una caché corta por par para sensores, tarjetas y servicio."""

from __future__ import annotations

import asyncio
import ssl
import time
from collections import defaultdict

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .api import Departures, fetch_departures
from .const import CACHE_SECONDS


class EfeHub:
    """Una consulta a la vez por par; solo se guardan respuestas válidas."""

    def __init__(self, hass: HomeAssistant, ssl_context: ssl.SSLContext) -> None:
        self._hass = hass
        self._ssl_context = ssl_context
        self._cache: dict[tuple[int, int], tuple[float, Departures]] = {}
        self._locks: defaultdict[tuple[int, int], asyncio.Lock] = defaultdict(asyncio.Lock)

    async def departures(self, origin: int, destination: int) -> Departures:
        key = (origin, destination)
        async with self._locks[key]:
            cached = self._cache.get(key)
            if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
                return cached[1]
            data = await fetch_departures(
                async_get_clientsession(self._hass),
                self._ssl_context,
                origin,
                destination,
                dt_util.now(),
            )
            self._cache[key] = (time.monotonic(), data)
            return data
