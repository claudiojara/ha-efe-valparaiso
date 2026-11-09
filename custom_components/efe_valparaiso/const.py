"""Constantes de EFE Valparaíso."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "efe_valparaiso"
VERSION = "0.3.0"  # igual que manifest.json

# Fuente pública y sin autenticación que usa la app EFE para «Próximos trenes».
API_URL = "https://ms4.metrovalparaiso.cl/"

CONF_ORIGIN = "origen"
CONF_DESTINATION = "destino"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_SCAN_INTERVAL = 60  # segundos
MIN_SCAN_INTERVAL = 30
MAX_SCAN_INTERVAL = 900
MAX_BACKOFF = timedelta(minutes=10)
CACHE_SECONDS = 20  # una respuesta de EFE se reutiliza por par durante este tiempo
SERVICE_CONSULTAR = "consultar"
REQUEST_TIMEOUT = 15
MAX_RESPONSE_BYTES = 1_048_576

ATTRIBUTION = "Datos de la API de próximos trenes de EFE Valparaíso (no oficial para terceros)"

# IDs de estación de la API (1–21), de Puerto a Limache.
STATIONS: dict[int, str] = {
    1: "Puerto",
    2: "Bellavista",
    3: "Francia",
    4: "Barón",
    5: "Portales",
    6: "Recreo",
    7: "Miramar",
    8: "Viña del Mar",
    9: "Hospital",
    10: "Chorrillos",
    11: "El Salto",
    12: "Valencia",
    13: "Quilpué",
    14: "El Sol",
    15: "El Belloto",
    16: "Las Américas",
    17: "La Concepción",
    18: "Villa Alemana",
    19: "Sargento Aldea",
    20: "Peñablanca",
    21: "Limache",
}
