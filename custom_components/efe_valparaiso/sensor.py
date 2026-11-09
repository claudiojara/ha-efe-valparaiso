"""Sensores de próximos trenes."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import EfeConfigEntry
from .api import NOTICE
from .const import ATTRIBUTION, DOMAIN, STATIONS
from .coordinator import EfeCoordinator

NO_SERVICES = "Sin servicios informados"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: EfeConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities([NextTrainSensor(coordinator), ServiceCountSensor(coordinator)])


class EfeEntity(CoordinatorEntity[EfeCoordinator]):
    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(self, coordinator: EfeCoordinator, key: str) -> None:
        super().__init__(coordinator)
        pair = f"{coordinator.origin}-{coordinator.destination}"
        self._attr_unique_id = f"{pair}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, pair)},
            name=f"EFE {STATIONS[coordinator.origin]} → {STATIONS[coordinator.destination]}",
            manufacturer="EFE Valparaíso",
            model="Próximos trenes",
            entry_type=DeviceEntryType.SERVICE,
        )


class NextTrainSensor(EfeEntity, SensorEntity):
    """Texto de EFE para el primer servicio («6 minutos», «cercano»), sin reinterpretar."""

    _attr_icon = "mdi:train"
    # La lista completa cambia en cada consulta; no se guarda en el historial.
    _unrecorded_attributes = frozenset({"servicios", "operabilidad", "fuente", "aviso"})

    def __init__(self, coordinator: EfeCoordinator) -> None:
        super().__init__(coordinator, "proximo_tren")

    @property
    def native_value(self) -> str:
        services = self.coordinator.data.services
        if not services:
            return NO_SERVICES
        return str(services[0].get("tiempo"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data
        first = data.services[0] if data.services else {}
        return {
            "hasta": first.get("hasta"),
            "tipo": first.get("tipo"),
            "id_servicio": first.get("idServicio"),
            "minutos": first.get("minutos"),
            "estado_consulta": data.state,
            "tiempo_real_confirmado": False,
            "aviso_efe": data.warning,
            "operabilidad": data.operability,
            "servicios": data.services,
            "aviso": NOTICE,
            "fuente": data.url,
        }


class ServiceCountSensor(EfeEntity, SensorEntity):
    """Cantidad de servicios que informó EFE. 0 = lista vacía; no disponible = fuente caída."""

    _attr_icon = "mdi:format-list-numbered"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: EfeCoordinator) -> None:
        super().__init__(coordinator, "servicios_informados")

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.services)
