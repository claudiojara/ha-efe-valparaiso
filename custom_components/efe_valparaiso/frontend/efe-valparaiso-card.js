/*
 * custom:efe-valparaiso-card — próximos trenes EFE Valparaíso (Limache–Puerto).
 * Sin dependencias. La sirve la integración efe_valparaiso.
 *
 * type: custom:efe-valparaiso-card
 * titulo: Trabajo                 # opcional
 * trayectos:                      # 1 o 2 (o más, en filas de dos)
 *   - origen: La Concepción       # consulta bajo demanda (servicio efe_valparaiso.consultar)
 *     destino: Francia
 *   - entity: sensor.efe_…        # o un sensor «Próximo tren» ya configurado
 * modo: input_boolean.x           # opcional: encendido = automático
 * actualizacion: auto             # sin `modo`: auto | manual (se puede cambiar en la tarjeta)
 * intervalo: 60                   # segundos entre consultas en automático (mínimo 30)
 * editable: true                  # tocar el nombre del trayecto para cambiar estaciones
 */
const CARD_VERSION = "0.3.1";
const STALE_MINUTES = 2;
const MIN_INTERVAL = 30;

// Mismo orden e IDs que la integración (const.py): Puerto = 1 … Limache = 21.
const STATIONS = [
  [1, "Puerto"], [2, "Bellavista"], [3, "Francia"], [4, "Barón"], [5, "Portales"], [6, "Recreo"],
  [7, "Miramar"], [8, "Viña del Mar"], [9, "Hospital"], [10, "Chorrillos"], [11, "El Salto"],
  [12, "Valencia"], [13, "Quilpué"], [14, "El Sol"], [15, "El Belloto"], [16, "Las Américas"],
  [17, "La Concepción"], [18, "Villa Alemana"], [19, "Sargento Aldea"], [20, "Peñablanca"], [21, "Limache"],
];
const norm = (v) => String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const stationName = (v) => {
  const n = norm(v);
  const hit = STATIONS.find(([id, name]) => String(id) === n || norm(name) === n);
  return hit ? hit[1] : null;
};

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } },
};
const hash = (text) => { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

const ICONS = {
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14"/><path d="M8 16l-1 4h10l-1-4"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
  edit: '<svg class="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
  simple: '<svg class="unit" width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/></svg>',
  doble: '<svg class="unit" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/><rect x="14.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/><path d="M12 5h2.5" stroke="currentColor"/></svg>',
};

const STYLE = `
  :host { display: block; }
  ha-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--primary-text-color); min-width: 0; }
  .title svg { width: 18px; height: 18px; flex: none; color: var(--efe-accent); }
  .actions { display: flex; gap: 6px; }
  button { font: inherit; color: inherit; cursor: pointer; }
  .btn { height: 36px; min-width: 36px; display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: 12px; border: 1px solid var(--divider-color, rgba(127,127,127,.25));
    background: rgba(127,127,127,.08); padding: 0 10px; font-size: 12px; font-weight: 500; }
  .btn svg { width: 15px; height: 15px; }
  .btn.mode-auto { color: var(--efe-accent); }
  .btn.refresh { color: var(--efe-info); border-color: color-mix(in srgb, var(--efe-info) 45%, transparent);
    background: color-mix(in srgb, var(--efe-info) 15%, transparent); padding: 0; }
  .btn.busy svg { animation: spin 1s linear infinite; }
  .btn.primary { color: var(--text-primary-color, #fff); background: var(--primary-color); border-color: transparent; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .grid { display: grid; gap: 10px; }
  .tile { border-radius: 16px; background: rgba(127,127,127,.08); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .row1 { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 24px; }
  .label { font-size: 13px; line-height: 1.3; color: var(--secondary-text-color); overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .row1 { align-items: flex-start; }
  .pick { border: 0; background: transparent; padding: 2px 0; display: flex; align-items: center; gap: 4px; min-width: 0; text-align: left; }
  .pick .pen { width: 13px; height: 13px; flex: none; color: var(--secondary-text-color); opacity: .7; }
  .body { border: 0; background: transparent; padding: 0; text-align: left; display: flex; flex-direction: column; gap: 4px; }
  .type { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--primary-text-color); white-space: nowrap; }
  .big { display: flex; align-items: baseline; gap: 4px; color: var(--primary-text-color); min-height: 40px; }
  .big .n { font-size: 38px; font-weight: 700; letter-spacing: -1px; line-height: 1; }
  .big .u { font-size: 15px; font-weight: 600; }
  .big .w { font-size: 22px; font-weight: 700; line-height: 1.2; }
  .big .h { margin-left: 6px; font-size: 13px; color: var(--secondary-text-color); }
  .stale .big, .stale .rest .m { color: var(--secondary-text-color); }
  .sep { height: 1px; background: var(--divider-color, rgba(127,127,127,.2)); margin: 2px 0; }
  .rest { display: grid; grid-template-columns: auto auto minmax(0, 1fr); column-gap: 8px; row-gap: 3px; align-items: center; font-size: 12px; }
  .rest .m { font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .rest .h { color: var(--secondary-text-color); white-space: nowrap; }
  .rest .t { display: flex; align-items: center; gap: 4px; color: var(--secondary-text-color); min-width: 0; flex-wrap: wrap; }
  .badge { font-size: 10.5px; font-weight: 600; color: #1a1205; background: var(--efe-warn); border-radius: 6px; padding: 1px 6px;
    white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 12px; color: var(--secondary-text-color); line-height: 1.35; }
  .warn { color: var(--efe-warn); }
  .panel { display: flex; flex-direction: column; gap: 8px; }
  .panel .top { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
  .panel .top .btn { padding: 0; width: 32px; height: 32px; }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center;
    padding: 6px 10px; border-radius: 10px; background: rgba(127,127,127,.08); font-size: 13px; }
  .line .t { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--secondary-text-color); }
  .line .m { font-weight: 600; text-align: right; }
  .line .h { color: var(--secondary-text-color); text-align: right; }
  .line.no { opacity: .75; }
  .pickrow { display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); gap: 8px; align-items: end; }
  .pickrow label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--secondary-text-color); }
  .pickrow select { font: inherit; font-size: 14px; color: var(--primary-text-color); background: rgba(127,127,127,.12);
    border: 1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius: 10px; padding: 8px; min-height: 40px; }
  .pickrow select option { color: initial; }
  .pickrow .btn { height: 40px; padding: 0; }
  .buttons { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .foot { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--secondary-text-color); }
`;

class EfeValparaisoCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("efe-valparaiso-card-editor");
  }

  static getStubConfig(hass) {
    const sensor = Object.values(hass?.states ?? {}).find(
      (s) => s.entity_id.startsWith("sensor.efe_") && s.attributes?.origen && s.attributes?.destino,
    );
    const origen = sensor?.attributes.origen ?? "Villa Alemana";
    const destino = sensor?.attributes.destino ?? "Puerto";
    return { trayectos: [{ origen, destino }, { origen: destino, destino: origen }] };
  }

  setConfig(config) {
    const trayectos = config?.trayectos;
    if (!Array.isArray(trayectos) || trayectos.length === 0) {
      throw new Error("Indica `trayectos`: una lista con `origen` y `destino`, o con `entity`.");
    }
    trayectos.forEach((t, i) => {
      if (t?.entity) return;
      const o = stationName(t?.origen), d = stationName(t?.destino);
      if (!o || !d) throw new Error(`Trayecto ${i + 1}: origen y destino deben ser estaciones de la línea (por nombre o ID 1–21).`);
      if (o === d) throw new Error(`Trayecto ${i + 1}: el origen y el destino deben ser distintos.`);
    });
    this._config = config;
    this._key = "efe-card:" + hash(JSON.stringify(trayectos));
    this._open = null;
    this._picking = null;
    this._data = {};
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
      this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    }
    this._render();
    this._tick();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
    if (first) this._tick();
  }

  connectedCallback() {
    this._visible = true;
    if ("IntersectionObserver" in window) {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((e) => e.isIntersecting);
        this._tick();
      });
      this._io.observe(this);
    }
    this._onVis = () => this._tick();
    document.addEventListener("visibilitychange", this._onVis);
    this._timer = setInterval(() => this._tick(), 5000);
    this._ageTimer = setInterval(() => this._render(), 30000);
    this._tick();
  }

  disconnectedCallback() {
    this._io?.disconnect();
    document.removeEventListener("visibilitychange", this._onVis);
    clearInterval(this._timer);
    clearInterval(this._ageTimer);
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  // ---------------------------------------------------------------- estado

  _override(i) { return storage.get(`${this._key}:t${i}`); }

  _source(i) {
    const cfg = this._config.trayectos[i];
    const ov = this._override(i);
    if (ov?.origen && ov?.destino) return { kind: "pair", origen: ov.origen, destino: ov.destino, nombre: undefined, override: true };
    if (cfg.entity) return { kind: "entity", entity: cfg.entity, nombre: cfg.nombre };
    return { kind: "pair", origen: stationName(cfg.origen), destino: stationName(cfg.destino), nombre: cfg.nombre, override: false };
  }

  _auto() {
    const modo = this._config.modo;
    if (modo) return this._hass?.states?.[modo]?.state === "on";
    const saved = storage.get(`${this._key}:modo`);
    return (saved ?? this._config.actualizacion ?? "auto") !== "manual";
  }

  _interval() { return Math.max(MIN_INTERVAL, Number(this._config.intervalo) || 60) * 1000; }

  _signature() {
    if (!this._hass || !this._config) return "";
    const ids = [...this._config.trayectos.map((t) => t.entity), this._config.modo].filter(Boolean);
    return ids.map((id) => {
      const s = this._hass.states[id];
      return s ? `${s.state}|${s.attributes.consultado_en ?? ""}|${s.last_updated}` : "-";
    }).join("~");
  }

  // Consulta los trayectos por estación: en automático, solo mientras la tarjeta se ve.
  _tick() {
    if (!this._hass || !this._config) return;
    const visible = this._visible !== false && document.visibilityState !== "hidden";
    if (!visible) return;
    const auto = this._auto();
    this._config.trayectos.forEach((_, i) => {
      const src = this._source(i);
      if (src.kind !== "pair") return;
      const d = this._data[i];
      const key = `${src.origen}|${src.destino}`;
      const due = !d || d.key !== key || (auto && Date.now() - d.at >= this._interval());
      if (due && !d?.loading) this._fetch(i, src);
    });
  }

  async _fetch(i, src) {
    const key = `${src.origen}|${src.destino}`;
    const prev = this._data[i];
    this._data[i] = { ...(prev?.key === key ? prev : {}), key, loading: true, at: prev?.key === key ? prev.at : 0 };
    this._render();
    try {
      const res = await this._hass.callWS({
        type: "call_service", domain: "efe_valparaiso", service: "consultar",
        service_data: { origen: src.origen, destino: src.destino }, return_response: true,
      });
      this._data[i] = { key, at: Date.now(), payload: res?.response ?? res, error: null };
    } catch (err) {
      const missing = /not.?found/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);
      this._data[i] = { key, at: Date.now(), payload: null, error: missing ? "missing" : "source" };
    }
    this._busy = this._config.trayectos.some((_, j) => this._data[j]?.loading) && this._busy;
    this._render();
  }

  // ---------------------------------------------------------------- eventos

  _onClick(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el || !this._hass) return;
    const action = el.dataset.action;
    const i = Number(el.dataset.index);
    if (action === "mode") {
      if (this._config.modo) this._hass.callService("input_boolean", "toggle", { entity_id: this._config.modo });
      else { storage.set(`${this._key}:modo`, this._auto() ? "manual" : "auto"); this._render(); this._tick(); }
    } else if (action === "refresh") {
      this._busy = true;
      const entities = [];
      this._config.trayectos.forEach((_, j) => {
        const src = this._source(j);
        if (src.kind === "entity") entities.push(src.entity);
        else this._fetch(j, src);
      });
      if (entities.length) this._hass.callService("homeassistant", "update_entity", { entity_id: entities });
      this._render();
      setTimeout(() => { this._busy = false; this._render(); }, 4000);
    } else if (action === "open") {
      this._open = i; this._picking = null; this._render();
    } else if (action === "pick") {
      const src = this._source(i);
      const t = this._trayecto(i);
      this._picking = i;
      this._draft = { origen: src.origen ?? stationName(t.origen) ?? "Villa Alemana", destino: src.destino ?? stationName(t.destino) ?? "Puerto" };
      this._open = null; this._render();
    } else if (action === "swap") {
      this._draft = { origen: this._draft.destino, destino: this._draft.origen }; this._render();
    } else if (action === "apply") {
      if (this._draft.origen === this._draft.destino) return;
      storage.set(`${this._key}:t${this._picking}`, this._draft);
      this._picking = null; this._render(); this._tick();
    } else if (action === "reset") {
      storage.set(`${this._key}:t${this._picking}`, null);
      this._picking = null; this._render(); this._tick();
    } else if (action === "close") {
      this._open = null; this._picking = null; this._render();
    }
  }

  _onChange(ev) {
    const el = ev.target;
    if (el.dataset?.field && this._draft) {
      this._draft = { ...this._draft, [el.dataset.field]: el.value };
      this._render();
    }
  }

  // ---------------------------------------------------------------- datos a mostrar

  _services(list) {
    return (Array.isArray(list) ? list : []).map((s) => ({
      tiempo: s.tiempo,
      min: Number.isInteger(s.minutos) ? s.minutos : null,
      hora: typeof s.hora_estimada === "string" ? s.hora_estimada.slice(11, 16) : null,
      tipo: s.tipo,
      doble: String(s.tipo).toLowerCase() === "doble",
      final: s.estacion_final || String(s.hasta ?? "").replace(/^hasta\s+/i, ""),
      llega: s.llega_a_destino,
    }));
  }

  _trayecto(i) {
    const src = this._source(i);
    const out = { index: i, src, nombre: src.nombre, origen: src.origen ?? "", destino: src.destino ?? "", status: "ok", age: null, services: [], loading: false };
    let payload = null;
    if (src.kind === "entity") {
      const st = this._hass?.states?.[src.entity];
      const a = st?.attributes ?? {};
      out.origen = a.origen ?? "";
      out.destino = a.destino ?? "";
      if (!out.origen && typeof a.friendly_name === "string") {
        out.nombre = out.nombre ?? a.friendly_name.replace(/^EFE\s+/, "").replace(/\s+(Próximo tren|Next train)$/i, "");
      }
      if (!st || st.state === "unavailable" || st.state === "unknown" || !Array.isArray(a.servicios)) out.status = "error";
      else payload = a;
    } else {
      const d = this._data[i];
      out.loading = !!d?.loading;
      if (!d || (d.loading && !d.payload && !d.error)) out.status = "loading";
      else if (d.error) out.status = d.error === "missing" ? "missing" : "error";
      else payload = d.payload;
    }
    if (payload) {
      if (payload.consultado_en) out.age = Math.max(0, Math.floor((Date.now() - Date.parse(payload.consultado_en)) / 60000));
      out.services = this._services(payload.servicios);
      if (out.services.length === 0) out.status = "empty";
    }
    return out;
  }

  // ---------------------------------------------------------------- render

  _unit(s) { return s.tipo ? `${s.doble ? ICONS.doble : ICONS.simple}${esc(s.tipo)}` : ""; }

  _when(s) { return s.min !== null ? `${s.min} min` : esc(s.tiempo); }

  _badge(s, t) {
    return s.llega === false ? `<span class="badge" title="Termina en ${esc(s.final)}: no llega a ${esc(t.destino)}">${esc(s.final)}</span>` : "";
  }

  _label(t, sharedOrigin) {
    return t.nombre ?? (sharedOrigin ? `→ ${t.destino}` : `${t.origen} → ${t.destino}`);
  }

  _labelHtml(t, sharedOrigin) {
    const text = esc(this._label(t, sharedOrigin));
    if (this._config.editable === false) return `<span class="label">${text}</span>`;
    return `<button class="pick" data-action="pick" data-index="${t.index}" aria-label="Cambiar trayecto ${text}"><span class="label">${text}</span>${ICONS.edit}</button>`;
  }

  _tile(t, sharedOrigin) {
    const label = this._labelHtml(t, sharedOrigin);
    const msg = {
      loading: ['<span class="w">…</span>', "Consultando a EFE."],
      error: ['<span class="w">Sin datos</span>', "No se pudo consultar a EFE. No se muestran tiempos antiguos."],
      missing: ['<span class="w">Sin servicio</span>', "Agrega la integración EFE Valparaíso para consultar trayectos."],
      empty: ['<span class="w warn">Sin trenes informados</span>', "EFE respondió sin trenes. No garantiza que no los haya."],
    }[t.status];
    if (msg) {
      return `<div class="tile"><div class="row1">${label}</div><div class="big">${msg[0]}</div><span class="note">${msg[1]}</span></div>`;
    }
    const stale = t.age !== null && t.age >= STALE_MINUTES;
    const mainIdx = t.services.findIndex((s) => s.llega !== false);
    const main = mainIdx >= 0 ? t.services[mainIdx] : null;
    const rest = t.services.filter((_, i) => i !== mainIdx).slice(0, 3);
    const big = !main
      ? `<span class="w warn">Ninguno llega a ${esc(t.destino)}</span>`
      : main.min !== null
        ? `<span class="n">${main.min}</span><span class="u">min</span>${main.hora ? `<span class="h">≈ ${esc(main.hora)}</span>` : ""}`
        : `<span class="w">${esc(main.tiempo)}</span>`;
    const rows = rest.map((s) => `<span class="m">${this._when(s)}</span>
      <span class="h">${s.hora ? `≈ ${esc(s.hora)}` : ""}</span>
      <span class="t">${this._unit(s)}${this._badge(s, t)}</span>`).join("");
    return `<div class="tile${stale ? " stale" : ""}">
      <div class="row1">${label}${main ? `<span class="type">${this._unit(main)}</span>` : ""}</div>
      <button class="body" data-action="open" data-index="${t.index}" aria-label="Ver todos los trenes ${esc(this._label(t, sharedOrigin))}">
        <div class="big">${big}</div>
        ${rows ? `<div class="sep"></div><div class="rest">${rows}</div>` : ""}
      </button>
    </div>`;
  }

  _detail(t, sharedOrigin) {
    const lines = t.services.length
      ? t.services.map((s) => `<div class="line${s.llega === false ? " no" : ""}">
          <span>${esc(s.final)}${s.llega === false ? ` <span class="badge">no llega a ${esc(t.destino)}</span>` : ""}</span>
          <span class="t">${this._unit(s)}</span>
          <span class="m">${this._when(s)}</span>
          <span class="h">${s.hora ? `≈ ${esc(s.hora)}` : ""}</span></div>`).join("")
      : `<span class="note">${t.status === "empty" ? "EFE respondió sin trenes." : "Sin datos de EFE."}</span>`;
    return `<div class="panel"><div class="top">
      <button class="btn" data-action="close" aria-label="Volver">${ICONS.back}</button><span>${esc(this._label(t, sharedOrigin))}</span></div>${lines}</div>`;
  }

  _picker() {
    const i = this._picking;
    const d = this._draft;
    const opts = (sel) => STATIONS.map(([, name]) => `<option value="${esc(name)}"${name === sel ? " selected" : ""}>${esc(name)}</option>`).join("");
    const overridden = !!this._override(i);
    const same = d.origen === d.destino;
    return `<div class="panel">
      <div class="top"><button class="btn" data-action="close" aria-label="Volver">${ICONS.back}</button><span>Cambiar trayecto ${i + 1}</span></div>
      <div class="pickrow">
        <label>Origen<select data-field="origen">${opts(d.origen)}</select></label>
        <button class="btn" data-action="swap" aria-label="Invertir sentido">${ICONS.swap}</button>
        <label>Destino<select data-field="destino">${opts(d.destino)}</select></label>
      </div>
      ${same ? '<span class="note warn">El origen y el destino deben ser distintos.</span>' : ""}
      <span class="note">El cambio queda guardado solo en este navegador. No modifica la configuración del panel ni tus automatizaciones.</span>
      <div class="buttons">
        ${overridden ? '<button class="btn" data-action="reset">Volver al configurado</button>' : ""}
        <button class="btn primary" data-action="apply"${same ? " disabled" : ""}>Ver trenes</button>
      </div>
    </div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const trayectos = this._hass ? this._config.trayectos.map((_, i) => this._trayecto(i)) : [];
    const origins = new Set(trayectos.map((t) => t.origen).filter(Boolean));
    const sharedOrigin = trayectos.length > 1 && origins.size === 1 && trayectos.every((t) => t.origen && !t.nombre);
    const title = this._config.titulo ?? (sharedOrigin ? `Tren · ${[...origins][0]}` : "Tren");
    const auto = this._auto();
    const showRefresh = !auto || (this._config.actualizar === true);
    const ages = trayectos.map((t) => t.age).filter((x) => x !== null);
    const age = ages.length ? Math.max(...ages) : null;
    const allDown = trayectos.length > 0 && trayectos.every((t) => t.status === "error" || t.status === "missing");
    const freshness = allDown ? "Sin datos de EFE" : age === null ? "" : age < STALE_MINUTES ? "Actualizado hace segundos" : `Dato de hace ${age} min`;
    const cols = Math.min(trayectos.length || 1, 2);
    const busy = this._busy || trayectos.some((t) => t.loading);
    let body;
    if (this._picking !== null && this._draft) body = this._picker();
    else if (this._open !== null && trayectos[this._open]) body = this._detail(trayectos[this._open], sharedOrigin);
    else body = `<div class="grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));">${trayectos.map((t) => this._tile(t, sharedOrigin)).join("")}</div>`;

    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card style="--efe-accent: var(--success-color, #4caf50); --efe-info: var(--info-color, #3b82f6); --efe-warn: var(--warning-color, #f2b84b);">
        <div class="head">
          <div class="title">${ICONS.train}<span>${esc(title)}</span></div>
          <div class="actions">
            ${showRefresh ? `<button class="btn refresh${busy ? " busy" : ""}" data-action="refresh" aria-label="Actualizar ahora">${ICONS.auto}</button>` : ""}
            <button class="btn ${auto ? "mode-auto" : ""}" data-action="mode" aria-label="Cambiar modo de actualización">${auto ? ICONS.auto : ICONS.hand}<span>${auto ? "Auto" : "Manual"}</span></button>
          </div>
        </div>
        ${body}
        <div class="foot"><span>${esc(freshness)}</span><span>≈ hora estimada · tiempos de EFE</span></div>
      </ha-card>`;
  }
}

// ==================================================================== editor visual

const EDITOR_LABELS = {
  titulo: "Título (opcional)",
  modo: "Helper de modo automático (opcional, input_boolean)",
  actualizacion: "Modo inicial sin helper",
  intervalo: "Segundos entre consultas en automático",
  editable: "Permitir cambiar el trayecto desde la tarjeta",
  origen_1: "Origen", destino_1: "Destino", nombre_1: "Nombre (opcional)", entity_1: "Sensor (en vez de estaciones)",
  origen_2: "Origen", destino_2: "Destino", nombre_2: "Nombre (opcional)", entity_2: "Sensor (en vez de estaciones)",
};

const stationSelector = () => ({ select: { mode: "dropdown", options: STATIONS.map(([, name]) => ({ value: name, label: name })) } });

const trayectoSchema = (n, required) => [
  { type: "grid", name: "", schema: [
    { name: `origen_${n}`, required, selector: stationSelector() },
    { name: `destino_${n}`, required, selector: stationSelector() },
  ] },
  { name: `nombre_${n}`, selector: { text: {} } },
  { type: "expandable", name: "", flatten: true, title: "Usar un sensor ya configurado", schema: [
    { name: `entity_${n}`, selector: { entity: { filter: { integration: "efe_valparaiso", domain: "sensor" } } } },
  ] },
];

const EDITOR_SCHEMA = [
  { name: "titulo", selector: { text: {} } },
  { type: "expandable", name: "", flatten: true, title: "Trayecto 1", expanded: true, schema: trayectoSchema(1, true) },
  { type: "expandable", name: "", flatten: true, title: "Trayecto 2 (opcional, por ejemplo la vuelta)", expanded: true, schema: trayectoSchema(2, false) },
  { type: "expandable", name: "", flatten: true, title: "Actualización", schema: [
    { name: "modo", selector: { entity: { filter: { domain: "input_boolean" } } } },
    { name: "actualizacion", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automático (mientras se ve)" }, { value: "manual", label: "Manual" }] } } },
    { name: "intervalo", selector: { number: { min: MIN_INTERVAL, max: 900, step: 10, mode: "box", unit_of_measurement: "s" } } },
    { name: "editable", selector: { boolean: {} } },
  ] },
];

// Configuración ↔ campos planos del formulario. Conserva lo que el editor no muestra.
function configToForm(config) {
  const f = { titulo: config.titulo ?? "", modo: config.modo ?? "", actualizacion: config.actualizacion ?? "auto",
    intervalo: config.intervalo ?? 60, editable: config.editable !== false };
  (config.trayectos ?? []).slice(0, 2).forEach((t, i) => {
    const n = i + 1;
    f[`origen_${n}`] = stationName(t.origen) ?? "";
    f[`destino_${n}`] = stationName(t.destino) ?? "";
    f[`nombre_${n}`] = t.nombre ?? "";
    f[`entity_${n}`] = t.entity ?? "";
  });
  return f;
}

function formToConfig(form, previous) {
  const config = { ...previous };
  const set = (key, value, isDefault) => { if (value === undefined || value === "" || isDefault) delete config[key]; else config[key] = value; };
  set("titulo", form.titulo);
  set("modo", form.modo);
  set("actualizacion", form.actualizacion, form.actualizacion === "auto");
  set("intervalo", Number(form.intervalo) || undefined, Number(form.intervalo) === 60);
  set("editable", form.editable === false ? false : undefined);
  const trayectos = [];
  for (const n of [1, 2]) {
    const t = {};
    if (form[`entity_${n}`]) t.entity = form[`entity_${n}`];
    else if (form[`origen_${n}`] || form[`destino_${n}`]) { t.origen = form[`origen_${n}`] || undefined; t.destino = form[`destino_${n}`] || undefined; }
    else continue;
    if (form[`nombre_${n}`]) t.nombre = form[`nombre_${n}`];
    trayectos.push(t);
  }
  config.trayectos = [...trayectos, ...(previous.trayectos ?? []).slice(2)];
  return config;
}

async function ensureHaForm(timeoutMs) {
  if (customElements.get("ha-form")) return true;
  (async () => {
    const helpers = await window.loadCardHelpers?.();
    const card = await helpers?.createCardElement?.({ type: "entities", entities: [] });
    await card?.constructor?.getConfigElement?.();
  })().catch(() => undefined);
  return Promise.race([
    customElements.whenDefined("ha-form").then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

class EfeValparaisoCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
      if (!this._form.isConnected) this.shadowRoot?.getElementById("root")?.appendChild(this._form);
    }
  }

  connectedCallback() {
    if (this._started) return;
    this._started = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
      .note { color: var(--secondary-text-color); font-size: 12px; margin: 8px 0 0; }
      .fallback { display: flex; flex-direction: column; gap: 10px; }
      .fallback label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
      .fallback input, .fallback select { font: inherit; padding: 6px; }
      .fallback h4 { margin: 8px 0 0; }
    </style><div id="root"></div>
    <p class="note">Las estaciones se consultan bajo demanda: no crean dispositivos ni afectan tus automatizaciones.</p>`;
    ensureHaForm(4000).then((ok) => { this._mode = ok ? "ha-form" : "fallback"; this._build(); });
  }

  _emit(form) {
    this._config = formToConfig(form, this._config ?? {});
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _build() {
    const root = this.shadowRoot?.getElementById("root");
    if (!root || !this._mode) return;
    root.innerHTML = "";
    if (this._mode === "ha-form") {
      const form = document.createElement("ha-form");
      // hass, datos y schema antes de insertarlo: sus selectores los necesitan al dibujarse.
      form.hass = this._hass;
      form.data = configToForm(this._config ?? { trayectos: [] });
      form.schema = EDITOR_SCHEMA;
      form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.title ?? s.name;
      form.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._emit(ev.detail.value); });
      this._form = form;
      if (this._hass) root.appendChild(form);
    } else {
      this._form = null;
      root.innerHTML = this._fallbackHtml();
      root.addEventListener("change", () => this._emit(this._readFallback(root)));
    }
    this._update();
  }

  _fallbackHtml() {
    const opts = STATIONS.map(([, n]) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    const tr = (n) => `<h4>Trayecto ${n}${n === 2 ? " (opcional)" : ""}</h4>
      <label>Origen<select data-k="origen_${n}"><option value=""></option>${opts}</select></label>
      <label>Destino<select data-k="destino_${n}"><option value=""></option>${opts}</select></label>
      <label>Nombre (opcional)<input data-k="nombre_${n}"></label>
      <label>Sensor en vez de estaciones (opcional)<input data-k="entity_${n}" placeholder="sensor.efe_…"></label>`;
    return `<div class="fallback">
      <label>Título (opcional)<input data-k="titulo"></label>${tr(1)}${tr(2)}
      <h4>Actualización</h4>
      <label>Helper de modo automático (opcional)<input data-k="modo" placeholder="input_boolean.…"></label>
      <label>Modo inicial sin helper<select data-k="actualizacion"><option value="auto">Automático</option><option value="manual">Manual</option></select></label>
      <label>Segundos entre consultas<input data-k="intervalo" type="number" min="${MIN_INTERVAL}" max="900"></label>
      <label><span><input data-k="editable" type="checkbox"> Permitir cambiar el trayecto desde la tarjeta</span></label>
    </div>`;
  }

  _readFallback(root) {
    const f = {};
    root.querySelectorAll("[data-k]").forEach((el) => { f[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; });
    return f;
  }

  _update() {
    if (!this._config) return;
    const data = configToForm(this._config);
    if (this._form) {
      this._form.hass = this._hass;
      this._form.data = data;
    } else if (this._mode === "fallback") {
      this.shadowRoot.querySelectorAll("[data-k]").forEach((el) => {
        const v = data[el.dataset.k];
        if (el.type === "checkbox") el.checked = v !== false; else el.value = v ?? "";
      });
    }
  }
}

if (!customElements.get("efe-valparaiso-card-editor")) {
  customElements.define("efe-valparaiso-card-editor", EfeValparaisoCardEditor);
}
if (!customElements.get("efe-valparaiso-card")) {
  customElements.define("efe-valparaiso-card", EfeValparaisoCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "efe-valparaiso-card",
    name: "EFE Valparaíso",
    description: "Próximos trenes de uno o dos trayectos (ida y vuelta) entre cualquier par de estaciones.",
    preview: true,
    documentationURL: "https://github.com/claudiojara/ha-efe-valparaiso",
  });
  console.info(`%c EFE-VALPARAISO-CARD %c ${CARD_VERSION} `, "background:#2e7d32;color:#fff", "background:#ddd;color:#000");
}
// Para pruebas: funciones puras del editor.
window.__efeValparaisoCard = { configToForm, formToConfig, stationName, STATIONS };
