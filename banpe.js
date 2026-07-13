/**
 * Módulo BANPE — selector BD / lista de pacientes (lógica separada de static/script.js).
 * Registro, edición e informe: estructura de UI; acciones aún sin implementar.
 */

let selectedBanpeDatabase = null;
let allBanpePatients = [];
let banpeScoringTableBuilt = false;
let banpeEvalDateListenerAttached = false;
let banpeScoringListenersAttached = false;
let banpeTotalsRecalcTimer = null;
let banpeNormStyleTimer = null;
const BANPE_NORM_LS_KEY = 'banpe_norm_tables_v2';
const BANPE_COD_LS_KEY = 'banpe_cod_tables_v1';

/**
 * Filas de la tabla BANPE: [área, subprueba, id estable para inputs]
 * Los totales llevan clase visual distinta (isTotal).
 */
const BANPE_SCORE_TUPLES = [
    ['Orientación', 'Orientación Persona', 'ori_persona'],
    ['Orientación', 'Orientación Tiempo', 'ori_tiempo'],
    ['Orientación', 'Orientación Espacio', 'ori_espacio'],
    ['Orientación', 'Total — Orientación', 'ori_total', true],
    ['Atención y Concentración', 'Dígitos en Progresión (total)', 'atc_digitos_prog'],
    ['Atención y Concentración', 'Cubos en Progresión (total)', 'atc_cubos_prog'],
    ['Atención y Concentración', 'Cancelación visual (total)', 'atc_cancel_vis'],
    ['Atención y Concentración', 'Detección de dígitos (total)', 'atc_detect_digit'],
    ['Atención y Concentración', 'Búsqueda visual (total)', 'atc_busq_vis'],
    ['Atención y Concentración', 'Total — Atención y Concentración', 'atc_total', true],
    ['Memoria — Codificación', 'Curva de Memoria verbal. Vol. total promedio', 'mem_cod_mv_verbal'],
    ['Memoria — Codificación', 'Curva de Memoria visual. Vol. total promedio', 'mem_cod_mv_visual'],
    ['Memoria — Evocación', 'Curva de Memoria verbal. Recuperación espontánea. Aciertos', 'mem_evo_r_esp'],
    ['Memoria — Evocación', 'Curva de Memoria verbal. Recuperación por clave. Aciertos', 'mem_evo_r_clave'],
    ['Memoria — Evocación', 'Curva de Memoria verbal. Reconocimiento (total)', 'mem_evo_r_verbal'],
    ['Memoria — Evocación', 'Curva de Memoria visual. Reconocimiento (total)', 'mem_evo_r_visual'],
    ['Memoria — Evocación', 'Total — Memoria', 'mem_total', true],
    ['Lenguaje — Comprensión', 'Identificación — partes del cuerpo. Aciertos', 'len_comp_cuerpo'],
    ['Lenguaje — Comprensión', 'Preposiciones. Aciertos', 'len_comp_prep'],
    ['Lenguaje — Comprensión', 'Verbos. Aciertos', 'len_comp_verbos'],
    ['Lenguaje — Comprensión', 'Reconocimiento de colores. Aciertos', 'len_comp_colores'],
    ['Lenguaje — Comprensión', 'Instrucciones. Aciertos', 'len_comp_inst'],
    ['Lenguaje — Comprensión', 'Plural. Aciertos', 'len_comp_plural'],
    ['Lenguaje — Comprensión', 'Total — Lenguaje Comprensión', 'len_comp_total', true],
    ['Lenguaje — Expresión', 'Completar oraciones. Aciertos', 'len_exp_orac'],
    ['Lenguaje — Expresión', 'Opuestos. Aciertos', 'len_exp_opuestos'],
    ['Lenguaje — Expresión', 'Conversación (total)', 'len_exp_conv'],
    ['Lenguaje — Expresión', 'Fluidez verbal. Aciertos', 'len_exp_fluidez'],
    ['Lenguaje — Expresión', 'Total — Lenguaje Expresión', 'len_exp_total', true],
    ['Lenguaje — Articulación', 'Estructuras orofaciales. Aciertos', 'len_art_orof'],
    ['Lenguaje — Articulación', 'Repetición de fonemas. Aciertos', 'len_art_fon'],
    ['Lenguaje — Articulación', 'Total — Lenguaje Articulación', 'len_art_total', true],
    ['Coordinación motora', 'Motora gruesa (total)', 'coor_gruesa'],
    ['Coordinación motora', 'Motora fina (total)', 'coor_fina'],
    ['Coordinación motora', 'Total — Coordinación motora', 'coor_total', true],
    ['Habilidades académicas', 'Identificación de letras y números. Aciertos', 'hab_letras_num'],
    ['Habilidades académicas', 'Aritmética. Aciertos', 'hab_arit'],
    ['Habilidades académicas', 'Conteo. Aciertos', 'hab_conteo'],
    ['Habilidades académicas', 'Total — Habilidades académicas', 'hab_total', true],
    ['Inhibición', 'Stroop Ángel-Diablo (total)', 'inh_stroop_ad'],
    ['Inhibición', 'Stroop Día-Noche. Aciertos', 'inh_stroop_dn_ac'],
    ['Inhibición', 'Stroop Día-Noche. Tiempo', 'inh_stroop_dn_t'],
    ['Inhibición', 'Puño-dedo (total)', 'inh_puno_dedo'],
    ['Inhibición', 'Laberinto. Errores atravesar', 'inh_lab_err'],
    ['Inhibición', 'Demora de gratificación. Total errores voltear', 'inh_demora_err'],
    ['Inhibición', 'Total — Inhibición', 'inh_total', true],
    ['Memoria de Trabajo', 'Repartiendo leche (total)', 'mt_leche'],
    ['Memoria de Trabajo', 'Cubos en regresión (total)', 'mt_cubos_reg'],
    ['Memoria de Trabajo', 'Dígitos en Regresión (total)', 'mt_digit_reg'],
    ['Memoria de Trabajo', 'Total — Memoria de Trabajo', 'mt_total', true],
    ['Flexibilidad mental', 'Categorización A. Aciertos', 'flex_cat_a'],
    ['Flexibilidad mental', 'Categorización B. Aciertos', 'flex_cat_b_ac'],
    ['Flexibilidad mental', 'Categorización B. Errores', 'flex_cat_b_err'],
    ['Flexibilidad mental', 'Categorización B. Perseveraciones', 'flex_cat_b_pers'],
    ['Flexibilidad mental', 'Categorización B. Perseveraciones de criterios', 'flex_cat_b_pers_crit'],
    ['Flexibilidad mental', 'Categorización B. Errores de mantenimiento', 'flex_cat_b_err_man'],
    ['Flexibilidad mental', 'Total — Flexibilidad Mental', 'flex_total', true],
    ['Planeación', 'El Cartero (total)', 'plan_cartero'],
    ['Planeación', 'Laberintos (Nivel)', 'plan_lab_nivel'],
    ['Planeación', 'Laberintos. Errores camino sin salida', 'plan_lab_err'],
    ['Planeación', 'Total — Planeación', 'plan_total', true],
    ['Abstracción', 'Absurdos. Aciertos', 'abs_absurdos'],
    ['Abstracción', 'Total — Abstracción', 'abs_total', true],
    ['Teoría de la mente', 'Teoría de la mente (total)', 'tom_total_item'],
    ['Teoría de la mente', 'Total — Teoría de la mente', 'tom_total', true],
    ['Procesamiento Riesgo — Beneficio', 'Elección de gratificación. Opción elegida', 'ryb_gratif'],
    ['Procesamiento Riesgo — Beneficio', 'Prueba de Juego. Puntuación total', 'ryb_juego'],
    ['Procesamiento Riesgo — Beneficio', 'Total — Procesamiento Riesgo-Beneficio', 'ryb_total', true],
    ['Identificación de emociones', 'Identificación de emociones (total)', 'emo_id_total'],
    ['Identificación de emociones', 'Total — Identificación de emociones', 'emo_total', true]
];

/**
 * Filas donde el usuario captura puntuación codificada directamente.
 * En el resto, la codificada proviene del cálculo / sumatorio (columna inhabilitada).
 */
const BANPE_CODIFICADA_EDITABLE_KEYS = new Set([
    'len_exp_conv',
    'len_exp_fluidez',
    'inh_stroop_dn_t',
    'inh_lab_err',
    'inh_demora_err',
    'flex_cat_b_err',
    'flex_cat_b_pers',
    'flex_cat_b_pers_crit',
    'flex_cat_b_err_man',
    'plan_lab_err',
    'ryb_juego'
]);

(function initBanpeExpanderClosed() {
    const content = document.getElementById('banpeExpanderContent');
    const icon = document.getElementById('banpeExpanderIcon');
    if (!content || !icon) return;
    content.style.maxHeight = '0';
    content.classList.remove('expanded');
    icon.classList.remove('expanded');
})();

function recalculateBanpeExpanderHeight() {
    const content = document.getElementById('banpeExpanderContent');
    if (!content || !content.classList.contains('expanded')) return;
    content.style.maxHeight = content.scrollHeight + 'px';
}

function banpeFormatFileDate(dateString) {
    if (typeof formatDate === 'function') return formatDate(dateString);
    return dateString || '';
}

function banpeEscapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function banpeEscapeAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function banpeRowValue(row, candidateKeys) {
    if (!row) return '';
    for (const key of candidateKeys) {
        if (row[key] !== undefined && row[key] !== null) {
            const s = String(row[key]).trim();
            if (s !== '' && s.toLowerCase() !== 'nat') return s;
        }
    }
    return '';
}

function banpeBirthToIso(raw) {
    if (!raw) return '';
    const s = String(raw).trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return s;
}

function banpeNormalizeSexForSelect(raw) {
    const v = String(raw || '')
        .trim()
        .toUpperCase();
    if (!v) return '';
    if (v.startsWith('F') || v === 'FEMENINO') return 'F';
    if (v.startsWith('M') || v === 'MASCULINO' || v === 'HOMBRE' || v === 'H') return 'M';
    return '';
}

function banpeFormatSumDisplay(n) {
    if (!Number.isFinite(n)) return '';
    const r = Math.round(n * 1000) / 1000;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return String(r);
}

function banpeBuildAreaGroups() {
    const rows = BANPE_SCORE_TUPLES.map((t) => ({
        area: t[0],
        sub: t[1],
        key: t[2],
        isTotal: !!t[3]
    }));
    const areaGroups = [];
    let idx = 0;
    while (idx < rows.length) {
        const a = rows[idx].area;
        let j = idx;
        while (j < rows.length && rows[j].area === a) j++;
        areaGroups.push(rows.slice(idx, j));
        idx = j;
    }
    return areaGroups;
}

/** Columnas Excel para puntuación normalizada por área (debe coincidir con main.py BANPE_PNORM_EXCEL_COLUMNS). */
const BANPE_AREA_TO_PNORM_EXCEL_COL = {
    Orientación: 'PNorm_BANPE_Orientacion',
    'Atención y Concentración': 'PNorm_BANPE_Atencion_Concentracion',
    'Lenguaje — Comprensión': 'PNorm_BANPE_Lenguaje_Comprension',
    'Lenguaje — Expresión': 'PNorm_BANPE_Lenguaje_Expresion',
    'Lenguaje — Articulación': 'PNorm_BANPE_Lenguaje_Articulacion',
    'Coordinación motora': 'PNorm_BANPE_Coordinacion_Motora',
    'Habilidades académicas': 'PNorm_BANPE_Habilidades_Academicas',
    Inhibición: 'PNorm_BANPE_Inhibicion',
    'Memoria de Trabajo': 'PNorm_BANPE_Memoria_Trabajo',
    'Flexibilidad mental': 'PNorm_BANPE_Flexibilidad_Mental',
    Planeación: 'PNorm_BANPE_Planeacion',
    Abstracción: 'PNorm_BANPE_Abstraccion',
    'Teoría de la mente': 'PNorm_BANPE_Teoria_Mente',
    'Procesamiento Riesgo — Beneficio': 'PNorm_BANPE_Procesamiento_Riesgo_Beneficio'
};

function banpeParseOptionalNumberFromNormInput(el) {
    if (!el) return null;
    const t = String(el.value != null ? el.value : '')
        .trim()
        .replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

/** Objeto { PNorm_BANPE_*: number } para el backend / Excel. Memoria = suma Codificación + Evocación (celdas normalizadas). */
function banpeCollectPnormsForSave() {
    const groups = banpeBuildAreaGroups();
    const pnorms = {};
    let memCod = null;
    let memEvo = null;
    groups.forEach((group, gIdx) => {
        const areaStr = group[0].area;
        const el = document.getElementById(`banpe_norm_grp_${gIdx}`);
        const v = banpeParseOptionalNumberFromNormInput(el);
        if (areaStr === 'Memoria — Codificación') memCod = v;
        else if (areaStr === 'Memoria — Evocación') memEvo = v;
        else {
            const col = BANPE_AREA_TO_PNORM_EXCEL_COL[areaStr];
            if (col && v != null) pnorms[col] = v;
        }
    });
    if (memCod != null || memEvo != null) {
        const a = Number.isFinite(memCod) ? memCod : 0;
        const b = Number.isFinite(memEvo) ? memEvo : 0;
        pnorms.PNorm_BANPE_Memoria = a + b;
    }
    return pnorms;
}

function banpeSerializeRegistration() {
    const naturales = {};
    const codificadas = {};
    BANPE_SCORE_TUPLES.forEach((t) => {
        const k = t[2];
        const natEl = document.getElementById(`banpe_nat_${k}`);
        const codEl = document.getElementById(`banpe_cod_${k}`);
        if (natEl) naturales[k] = natEl.value != null ? String(natEl.value) : '';
        if (codEl) codificadas[k] = codEl.value != null ? String(codEl.value) : '';
    });
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        aplicador: {
            nombre: document.getElementById('banpeAplicadorNombre')?.value ?? '',
            telefono: document.getElementById('banpeAplicadorTelefono')?.value ?? '',
            correo: document.getElementById('banpeAplicadorCorreo')?.value ?? '',
            cargo: document.getElementById('banpeAplicadorCargo')?.value ?? ''
        },
        paciente: {
            sexo: document.getElementById('banpePacienteSexo')?.value ?? '',
            escolaridad: document.getElementById('banpePacienteEscolaridad')?.value ?? '',
            fechaEval: document.getElementById('banpePacienteFechaEval')?.value ?? ''
        },
        naturales,
        codificadas,
        aplicarPrueba:
            typeof window.banpeApplyCollectData === 'function' ? window.banpeApplyCollectData() : undefined
    };
}

function banpeApplyRegistrationPayload(reg) {
    if (!reg || typeof reg !== 'object') return;
    const ap = reg.aplicador || {};
    const pc = reg.paciente || {};
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v != null ? String(v) : '';
    };
    setVal('banpeAplicadorNombre', ap.nombre);
    setVal('banpeAplicadorTelefono', ap.telefono);
    setVal('banpeAplicadorCorreo', ap.correo);
    setVal('banpeAplicadorCargo', ap.cargo);
    setVal('banpePacienteSexo', pc.sexo);
    setVal('banpePacienteEscolaridad', pc.escolaridad);
    setVal('banpePacienteFechaEval', pc.fechaEval);

    const nat = reg.naturales && typeof reg.naturales === 'object' ? reg.naturales : {};
    const cod = reg.codificadas && typeof reg.codificadas === 'object' ? reg.codificadas : {};
    BANPE_SCORE_TUPLES.forEach((t) => {
        const k = t[2];
        if (Object.prototype.hasOwnProperty.call(nat, k)) setVal(`banpe_nat_${k}`, nat[k]);
        if (Object.prototype.hasOwnProperty.call(cod, k)) setVal(`banpe_cod_${k}`, cod[k]);
    });
    banpeRecalculateAllTotals();
    if (typeof updateBanpePatientAgeFromEvalDate === 'function') updateBanpePatientAgeFromEvalDate();
    else banpeApplyAllNormAutoFill();
    banpeRefreshAllNormInterpretationStyles();

    if (typeof window.banpeApplyLoadData === 'function') {
        window.banpeApplyLoadData(reg.aplicarPrueba);
    }
}

/** Meses cumplidos entre nacimiento (ISO) y fecha de evaluación. */
function banpeMonthsAtEvaluationDate() {
    const birth = document.getElementById('banpeRegBirthdateIso')?.value || '';
    const evalD = document.getElementById('banpePacienteFechaEval')?.value || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(evalD)) return null;
    const [by, bm, bd] = birth.split('-').map(Number);
    const [ey, em, ed] = evalD.split('-').map(Number);
    let months = (ey - by) * 12 + (em - bm);
    if (ed < bd) months -= 1;
    return months;
}

/** Columna 0 = 3–3:11, 1 = 4–4:11, 2 = 5–5:11; -1 fuera de rango manual. */
function banpeNormAgeColumnIndex() {
    const m = banpeMonthsAtEvaluationDate();
    if (m === null || !Number.isFinite(m)) return -1;
    if (m >= 36 && m <= 47) return 0;
    if (m >= 48 && m <= 59) return 1;
    if (m >= 60 && m <= 71) return 2;
    return -1;
}

function banpeNormTableIdForArea(areaStr) {
    const map = {
        Orientación: 'orientacion',
        'Atención y Concentración': 'atencion',
        'Memoria — Codificación': 'memoria',
        'Memoria — Evocación': 'memoria',
        'Lenguaje — Comprensión': 'comprension',
        'Lenguaje — Expresión': 'expresion',
        'Lenguaje — Articulación': 'articulacion',
        'Coordinación motora': 'coordinacion',
        'Habilidades académicas': 'habilidades',
        Inhibición: 'inhibicion',
        'Memoria de Trabajo': 'memoria_trabajo',
        'Flexibilidad mental': 'flexibilidad',
        Planeación: 'planeacion',
        Abstracción: 'abstraccion',
        'Teoría de la mente': 'teoria_mente',
        'Procesamiento Riesgo — Beneficio': 'riesgo_beneficio',
        'Identificación de emociones': null
    };
    return map[areaStr] !== undefined ? map[areaStr] : undefined;
}

function banpeTotalKeyForGroupNorm(group) {
    if (!group || !group.length) return null;
    const last = group[group.length - 1];
    if (last.isTotal) return last.key;
    if (group[0].area === 'Memoria — Codificación') return 'mem_total';
    return null;
}

function banpeLookupTripletNorm(tableId, naturalInt, colIdx) {
    const rows = typeof window !== 'undefined' ? window.BANPE_NORM_TRIPLETS?.[tableId] : null;
    if (!rows || !rows.length || colIdx < 0 || colIdx > 2) return null;
    const n0 = Math.round(Number(naturalInt));
    if (!Number.isFinite(n0)) return null;
    /** Total — teoría de la mente: puntuación natural 0 … filas−1 (como en el PDF). */
    if (tableId === 'teoria_mente') {
        if (n0 < 0 || n0 > rows.length - 1) return null;
        const row = rows[n0];
        if (!row) return null;
        const v = row[colIdx];
        return Number.isFinite(v) ? v : null;
    }
    if (n0 < 1) return null;
    const n = Math.min(n0, rows.length);
    const row = rows[n - 1];
    if (!row) return null;
    const v = row[colIdx];
    return Number.isFinite(v) ? v : null;
}

function banpeLookupRybNorm(naturalInt, colIdx) {
    const n0 = Math.round(Number(naturalInt));
    if (!Number.isFinite(n0) || n0 < 0) return null;
    if (n0 === 0) {
        const tm = typeof window !== 'undefined' ? window.BANPE_NORM_TRIPLETS?.teoria_mente : null;
        const row = tm && tm[0];
        return row && Number.isFinite(row[colIdx]) ? row[colIdx] : null;
    }
    const t = typeof window !== 'undefined' ? window.BANPE_NORM_RYB_TOTAL : null;
    if (!t || !t.length) return null;
    const n = Math.min(Math.max(n0, 1), 7);
    const row = t[n - 1];
    return row && Number.isFinite(row[colIdx]) ? row[colIdx] : null;
}

function banpeApplyAllNormAutoFill() {
    banpeInitNormTablesFromDefaultsAndStorage();
    if (typeof window === 'undefined' || !window.BANPE_NORM_TRIPLETS) return;
    const col = banpeNormAgeColumnIndex();
    const groups = banpeBuildAreaGroups();
    groups.forEach((group, gIdx) => {
        const el = document.getElementById(`banpe_norm_grp_${gIdx}`);
        if (!el || !el.classList.contains('banpe-norm-area-input')) return;
        const areaStr = group[0].area;
        const tableId = banpeNormTableIdForArea(areaStr);
        const totalKey = banpeTotalKeyForGroupNorm(group);
        el.removeAttribute('title');
        if (tableId == null) {
            return;
        }
        if (!totalKey) {
            el.value = '';
            banpeApplyNormInterpretationClass(el);
            return;
        }
        const idxEl = document.getElementById(`banpe_nat_${totalKey}`);
        const raw = idxEl && idxEl.value != null ? String(idxEl.value).trim() : '';
        if (raw === '') {
            el.value = '';
            banpeApplyNormInterpretationClass(el);
            return;
        }
        const natural = Math.round(parseFloat(raw.replace(',', '.')));
        const minNat = tableId === 'teoria_mente' ? 0 : 1;
        if (!Number.isFinite(natural) || natural < minNat) {
            el.value = '';
            banpeApplyNormInterpretationClass(el);
            return;
        }
        if (col < 0) {
            el.value = '';
            el.title =
                'Edad fuera de 3:0–5:11 años (según nacimiento y fecha de evaluación). Ajuste las fechas para normalizar automáticamente.';
            banpeApplyNormInterpretationClass(el);
            return;
        }
        let normVal = null;
        if (tableId === 'riesgo_beneficio') normVal = banpeLookupRybNorm(natural, col);
        else normVal = banpeLookupTripletNorm(tableId, natural, col);
        el.value = normVal != null ? String(normVal) : '';
        banpeApplyNormInterpretationClass(el);
    });
}

function banpeRecalculateAllTotals() {
    const rows = BANPE_SCORE_TUPLES.map((t) => ({ key: t[2], isTotal: !!t[3] }));
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i].isTotal) continue;
        const totalKey = rows[i].key;
        const totalNat = document.getElementById(`banpe_nat_${totalKey}`);
        if (!totalNat) continue;

        let anyContrib = false;
        let sum = 0;
        for (let j = i - 1; j >= 0 && !rows[j].isTotal; j--) {
            const k = rows[j].key;
            const useCod = BANPE_CODIFICADA_EDITABLE_KEYS.has(k);
            const el = document.getElementById(useCod ? `banpe_cod_${k}` : `banpe_nat_${k}`);
            const raw = el && el.value != null ? String(el.value).trim() : '';
            if (raw === '') continue;
            const num = parseFloat(raw.replace(',', '.'));
            if (!Number.isFinite(num)) continue;
            anyContrib = true;
            sum += num;
        }
        totalNat.value = anyContrib ? banpeFormatSumDisplay(sum) : '';
    }
    banpeApplyAllNormAutoFill();
}

function banpeScheduleRecalculateTotals() {
    if (banpeTotalsRecalcTimer) window.clearTimeout(banpeTotalsRecalcTimer);
    banpeTotalsRecalcTimer = window.setTimeout(() => {
        banpeTotalsRecalcTimer = null;
        banpeRecalculateAllTotals();
    }, 40);
}

/** Etiqueta de desempeño según puntuación normalizada (manual). */
function banpeNormPerformanceLabel(n) {
    if (!Number.isFinite(n)) return '';
    if (n >= 116) return 'Normal Alto';
    if (n >= 85) return 'Normal';
    if (n >= 70) return 'Alteración leve';
    return 'Alteración severa';
}

/** Interpretación visual según clasificación: ≥116 alto, 85–115 normal, 70–84 leve, ≤69 severa. */
function banpeApplyNormInterpretationClass(input) {
    if (!input || !input.classList.contains('banpe-norm-area-input')) return;
    const cap = input.closest('.banpe-norm-area-wrap')?.querySelector('.banpe-norm-performance');
    input.classList.remove('banpe-norm-low', 'banpe-norm-leve', 'banpe-norm-mid', 'banpe-norm-high');
    if (cap) cap.textContent = '';
    const raw = String(input.value != null ? input.value : '')
        .trim()
        .replace(',', '.');
    if (raw === '') return;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    if (cap) {
        const label = banpeNormPerformanceLabel(n);
        if (label) cap.textContent = label;
    }
    input.classList.remove('banpe-norm-leve');
    if (n < 70) input.classList.add('banpe-norm-low');
    else if (n < 85) input.classList.add('banpe-norm-leve');
    else if (n <= 115) input.classList.add('banpe-norm-mid');
    else input.classList.add('banpe-norm-high');
}

function banpeRefreshAllNormInterpretationStyles() {
    document.querySelectorAll('#banpeScoringTableMount .banpe-norm-area-input').forEach((el) => {
        banpeApplyNormInterpretationClass(el);
    });
}

function banpeScheduleNormInterpretationStyle(el) {
    if (!el || !el.classList.contains('banpe-norm-area-input')) return;
    if (banpeNormStyleTimer) window.clearTimeout(banpeNormStyleTimer);
    banpeNormStyleTimer = window.setTimeout(() => {
        banpeNormStyleTimer = null;
        banpeApplyNormInterpretationClass(el);
    }, 220);
}

function attachBanpeScoringTableListenersOnce() {
    const mount = document.getElementById('banpeScoringTableMount');
    if (!mount || banpeScoringListenersAttached) return;
    mount.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t && t.classList.contains('banpe-norm-area-input')) banpeScheduleNormInterpretationStyle(t);
        banpeScheduleRecalculateTotals();
    });
    mount.addEventListener('change', (ev) => {
        banpeScheduleRecalculateTotals();
        const t = ev.target;
        if (t && t.classList.contains('banpe-norm-area-input')) banpeApplyNormInterpretationClass(t);
    });
    mount.addEventListener(
        'focusout',
        (ev) => {
            const t = ev.target;
            if (t && t.classList.contains('banpe-norm-area-input')) {
                if (banpeNormStyleTimer) {
                    window.clearTimeout(banpeNormStyleTimer);
                    banpeNormStyleTimer = null;
                }
                banpeApplyNormInterpretationClass(t);
            }
        },
        true
    );
    banpeScoringListenersAttached = true;
}

function ensureBanpeScoringTableBuilt() {
    const mount = document.getElementById('banpeScoringTableMount');
    if (!mount || banpeScoringTableBuilt) return;

    const areaGroups = banpeBuildAreaGroups();

    let bodyHtml = '';
    areaGroups.forEach((group, gIdx) => {
        const rs = group.length;
        const normAreaId = `banpe_norm_grp_${gIdx}`;
        const areaLabel = group[0].area;
        const normTableId = banpeNormTableIdForArea(areaLabel);
        const normReadonly = normTableId != null ? ' readonly' : '';
        const normAutoCls = normTableId != null ? ' banpe-norm-auto' : '';
        group.forEach((r, idx) => {
            const areaCell =
                idx === 0
                    ? `<td class="banpe-td-area" rowspan="${rs}">${banpeEscapeHtml(r.area)}</td>`
                    : '';
            const trCls = r.isTotal ? ' class="banpe-tr-total"' : '';
            let natCell;
            let codCell;
            if (r.isTotal) {
                natCell = `<input type="text" inputmode="decimal" class="banpe-score-input banpe-total-sum-input" id="banpe_nat_${r.key}" name="banpe_nat_${r.key}" readonly autocomplete="off" aria-label="Natural (índice total calculado): ${banpeEscapeHtml(r.sub)}" placeholder="Índice total (suma automática)">`;
                codCell = `<input type="text" class="banpe-score-input banpe-cod-input-disabled" id="banpe_cod_${r.key}" name="banpe_cod_${r.key}" disabled autocomplete="off" aria-label="Codificada: ${banpeEscapeHtml(r.sub)}" title="No aplica en filas de total.">`;
            } else {
                const codEditable = BANPE_CODIFICADA_EDITABLE_KEYS.has(r.key);
                const codDisabledAttr = codEditable ? '' : ' disabled';
                const codClass = codEditable ? 'banpe-score-input' : 'banpe-score-input banpe-cod-input-disabled';
                const codTitle = codEditable
                    ? ''
                    : ' title="La puntuación codificada en esta fila se obtiene por cálculo a partir de la natural (no se captura aquí)."';
                natCell = `<input type="text" inputmode="decimal" class="banpe-score-input" id="banpe_nat_${r.key}" name="banpe_nat_${r.key}" autocomplete="off" aria-label="Natural: ${banpeEscapeHtml(r.sub)}">`;
                codCell = `<input type="text" inputmode="decimal" class="${codClass}" id="banpe_cod_${r.key}" name="banpe_cod_${r.key}" autocomplete="off" aria-label="Codificada: ${banpeEscapeHtml(r.sub)}"${codDisabledAttr}${codTitle}>`;
            }
            const normCell =
                idx === 0
                    ? `<td class="banpe-td-num banpe-td-norm-area" rowspan="${rs}"><div class="banpe-norm-area-wrap"><input type="text" inputmode="decimal" class="banpe-score-input banpe-norm-area-input${normAutoCls}" id="${normAreaId}" name="${normAreaId}"${normReadonly} autocomplete="off" aria-label="Puntuación normalizada${normTableId != null ? ' (automática por índice y edad)' : ''}: ${banpeEscapeHtml(areaLabel)}" placeholder="${normTableId != null ? 'Automático (índice + edad)' : 'Manual'}"><p class="banpe-norm-performance" aria-live="polite"></p></div></td>`
                    : '';
            bodyHtml += `<tr${trCls}>${areaCell}<td class="banpe-td-sub">${banpeEscapeHtml(
                r.sub
            )}</td><td class="banpe-td-num">${natCell}</td>${normCell}<td class="banpe-td-num">${codCell}</td></tr>`;
        });
    });

    mount.innerHTML = `
<table class="banpe-scoring-table">
  <thead>
    <tr>
      <th rowspan="2" class="banpe-th-area">Área</th>
      <th rowspan="2" class="banpe-th-sub">Subprueba</th>
      <th colspan="3" class="banpe-th-pun-main">Puntuación</th>
    </tr>
    <tr>
      <th class="banpe-th-subpun">Natural</th>
      <th class="banpe-th-subpun">Normalizada</th>
      <th class="banpe-th-subpun">Codificada</th>
    </tr>
  </thead>
  <tbody>${bodyHtml}</tbody>
</table>`;

    attachBanpeScoringTableListenersOnce();
    banpeRecalculateAllTotals();
    banpeRefreshAllNormInterpretationStyles();
    banpeScoringTableBuilt = true;
}

function attachBanpeEvalDateListenerOnce() {
    if (banpeEvalDateListenerAttached) return;
    const fe = document.getElementById('banpePacienteFechaEval');
    if (!fe) return;
    fe.addEventListener('change', updateBanpePatientAgeFromEvalDate);
    fe.addEventListener('input', updateBanpePatientAgeFromEvalDate);
    banpeEvalDateListenerAttached = true;
}

function updateBanpePatientAgeFromEvalDate() {
    const birth = document.getElementById('banpeRegBirthdateIso')?.value || '';
    const evalD = document.getElementById('banpePacienteFechaEval')?.value || '';
    const ageEl = document.getElementById('banpePacienteEdad');
    if (!ageEl) return;
    if (!birth || !evalD) {
        ageEl.value = '';
        banpeApplyAllNormAutoFill();
        return;
    }
    if (typeof calculateAgeInYearsAndMonths === 'function') {
        const ai = calculateAgeInYearsAndMonths(birth, evalD);
        ageEl.value = ai && ai.display ? ai.display : '';
    } else {
        ageEl.value = '';
    }
    banpeApplyAllNormAutoFill();
}

function banpeFillPatientFromRow(row, patientId) {
    const hidPid = document.getElementById('banpeRegPatientId');
    const hidBirth = document.getElementById('banpeRegBirthdateIso');
    const nombreEl = document.getElementById('banpePacienteNombre');
    const sexEl = document.getElementById('banpePacienteSexo');
    const escEl = document.getElementById('banpePacienteEscolaridad');
    const fe = document.getElementById('banpePacienteFechaEval');

    if (hidPid) hidPid.value = patientId;

    const nombre = banpeRowValue(row, [
        'Nombre_Completo',
        'Nombre_completo',
        'NOMBRE_COMPLETO',
        'Nombre_Paciente',
        'nombre_paciente',
        'Nombres',
        'Nombre'
    ]);
    if (nombreEl) nombreEl.value = nombre || `Paciente ${patientId}`;

    const birthRaw = banpeRowValue(row, ['Fecha_Nacimiento', 'fecha_nacimiento', 'FECHA_NACIMIENTO']);
    if (hidBirth) hidBirth.value = banpeBirthToIso(birthRaw);

    const sexRaw = banpeRowValue(row, ['Sexo', 'SEXO', 'Genero', 'GENERO', 'genero']);
    if (sexEl) sexEl.value = banpeNormalizeSexForSelect(sexRaw);

    const esc = banpeRowValue(row, [
        'Escolaridad',
        'escolaridad_actual',
        'Escolaridad_actual',
        'ESCOLARIDAD',
        'Grado_escolar',
        'Escolaridad_actual_nivel'
    ]);
    if (escEl) escEl.value = esc;

    if (fe) {
        if (typeof getTodayLocalISO === 'function') fe.value = getTodayLocalISO();
        else fe.value = new Date().toISOString().slice(0, 10);
    }

    updateBanpePatientAgeFromEvalDate();
}

/** Valores por defecto del paciente para la Historia Clínica BANPE (módulo Aplicar Prueba). */
window.banpeGetHistoriaClinicaDefaults = function () {
    const pid = document.getElementById('banpeRegPatientId')?.value || '';
    const row =
        selectedBanpeDatabase && selectedBanpeDatabase.data
            ? selectedBanpeDatabase.data.find((r) => String(r.ID_Unico) === String(pid))
            : null;
    const nombre = document.getElementById('banpePacienteNombre')?.value || '';
    const birth = document.getElementById('banpeRegBirthdateIso')?.value || '';
    const edad = document.getElementById('banpePacienteEdad')?.value || '';
    const direccion = banpeRowValue(row, [
        'Direccion',
        'direccion',
        'DIRECCION',
        'Domicilio',
        'domicilio',
        'Direccion_completa',
        'Direccion_Completa'
    ]);
    const today =
        typeof getTodayLocalISO === 'function' ? getTodayLocalISO() : new Date().toISOString().slice(0, 10);
    return {
        nombre_nino: nombre,
        fecha_nacimiento: birth,
        edad: edad,
        fecha_consulta: today,
        direccion: direccion,
        pa_fecha_evaluacion: today
    };
};

/** Misma lógica que hasAnthropometricData en static/script.js */
function banpeRowHasAnthropometric(row) {
    if (!row) return false;
    const cols = ['Estatura_cm', 'Peso_kg', 'IMC_kg_m2', 'Circunferencia_Cintura_cm', 'Perimetro_Braquial_cm'];
    return cols.some((col) => row[col] !== undefined && row[col] !== null && row[col] !== '');
}

/** Misma lógica que hasLipidProfileData en static/script.js */
function banpeRowHasLipidProfile(row) {
    if (!row) return false;
    const cols = ['Colesterol_Total_mg_dL', 'HDL_Colesterol_mg_dL', 'LDL_Colesterol_mg_dL', 'Trigliceridos_mg_dL'];
    return cols.some((col) => row[col] !== undefined && row[col] !== null && row[col] !== '');
}

async function loadBanpeDatabases() {
    try {
        const response = await fetch('/files');
        const result = await response.json();
        if (result.success && result.files && result.files.length > 0) {
            displayBanpeDatabases(result.files);
        } else {
            showEmptyBanpeDatabases();
        }
    } catch (e) {
        console.error('BANPE: error cargando bases de datos', e);
        showEmptyBanpeDatabases();
    }
}

function showEmptyBanpeDatabases() {
    const grid = document.getElementById('banpeDatabasesGrid');
    const empty = document.getElementById('banpeEmptyDatabases');
    if (!grid) return;
    grid.innerHTML = '';
    if (empty) {
        empty.style.display = 'block';
        grid.appendChild(empty);
    }
}

function displayBanpeDatabases(files) {
    const grid = document.getElementById('banpeDatabasesGrid');
    const empty = document.getElementById('banpeEmptyDatabases');
    if (!grid) return;
    if (!files || files.length === 0) {
        showEmptyBanpeDatabases();
        return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = files
        .map(
            (file) => `
        <div class="database-item" onclick="selectBanpeDatabase('${file.id}')">
            <h5>${banpeEscapeHtml(file.original_filename)}</h5>
            <p><i class="fas fa-table"></i> ${file.rows} filas</p>
            <p><i class="fas fa-columns"></i> ${file.columns.length} columnas</p>
            <p><i class="fas fa-calendar"></i> ${banpeEscapeHtml(banpeFormatFileDate(file.created_at))}</p>
            <button class="btn-select" type="button" onclick="event.stopPropagation(); selectBanpeDatabase('${file.id}')">
                <i class="fas fa-check"></i> Seleccionar
            </button>
        </div>
    `
        )
        .join('');
    requestAnimationFrame(() => recalculateBanpeExpanderHeight());
}

async function selectBanpeDatabase(databaseId) {
    if (typeof showLoading === 'function') showLoading('Cargando base de datos...');
    try {
        const response = await fetch(`/files/${databaseId}/complete`);
        const result = await response.json();
        if (!result.success) {
            if (typeof showToast === 'function') {
                showToast('Error al cargar la base de datos: ' + (result.error || 'Error desconocido'), 'error');
            }
            return;
        }
        selectedBanpeDatabase = { id: databaseId, data: result.data };
        allBanpePatients = result.data.map((row) => ({ id: row.ID_Unico }));

        const dbSel = document.getElementById('banpeDatabaseSelector');
        const ptSel = document.getElementById('banpePatientSelector');
        const reg = document.getElementById('banpeRegistrationPanel');
        if (reg) reg.style.display = 'none';
        if (dbSel) dbSel.style.display = 'none';
        if (ptSel) ptSel.style.display = 'block';

        await displayBanpePatients(allBanpePatients);
        if (typeof showToast === 'function') {
            showToast(`Base de datos cargada: ${result.rows} pacientes`, 'success');
        }
    } catch (e) {
        console.error('BANPE: selectBanpeDatabase', e);
        if (typeof showToast === 'function') showToast('Error al cargar la base de datos', 'error');
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

window.changeBanpeDatabase = function () {
    selectedBanpeDatabase = null;
    allBanpePatients = [];
    const dbSel = document.getElementById('banpeDatabaseSelector');
    const ptSel = document.getElementById('banpePatientSelector');
    const reg = document.getElementById('banpeRegistrationPanel');
    const search = document.getElementById('banpePatientSearch');
    if (reg) reg.style.display = 'none';
    if (ptSel) ptSel.style.display = 'none';
    if (dbSel) dbSel.style.display = 'block';
    if (search) search.value = '';
    loadBanpeDatabases();
    requestAnimationFrame(() => recalculateBanpeExpanderHeight());
};

window.filterBanpePatients = function () {
    const input = document.getElementById('banpePatientSearch');
    const term = (input && input.value ? input.value : '').toLowerCase().trim();
    const filtered = allBanpePatients.filter((p) => String(p.id).toLowerCase().includes(term));
    displayBanpePatients(filtered);
};

async function displayBanpePatients(patients) {
    const patientList = document.getElementById('banpePatientList');
    if (!patientList || !selectedBanpeDatabase) return;

    patientList.innerHTML = '<div style="text-align: center; padding: 20px;">Cargando estados de pacientes…</div>';

    const dbId = selectedBanpeDatabase.id;
    const rows = selectedBanpeDatabase.data || [];

    const enriched = await Promise.all(
        patients.map(async (patient) => {
            const row = rows.find((r) => String(r.ID_Unico) === String(patient.id));
            const hasAnt = banpeRowHasAnthropometric(row);
            const hasLip = banpeRowHasLipidProfile(row);
            let hasHC = false;
            try {
                const r = await fetch(
                    `/api/hc/check-patient-hc/${encodeURIComponent(dbId)}/${encodeURIComponent(String(patient.id))}`
                );
                if (r.ok) {
                    const j = await r.json();
                    hasHC = !!j.has_hc;
                }
            } catch (_) {
                /* ignorar */
            }
            let hasBanpe = false;
            try {
                const r2 = await fetch(
                    `/api/banpe/check-registration/${encodeURIComponent(dbId)}/${encodeURIComponent(String(patient.id))}`
                );
                if (r2.ok) {
                    const j2 = await r2.json();
                    hasBanpe = !!j2.has_banpe;
                }
            } catch (_) {
                /* ignorar */
            }
            return { patient, hasAnt, hasLip, hasHC, hasBanpe };
        })
    );

    patientList.innerHTML = '';

    const tagLine = (ok, labelOk, labelNo) => {
        const ic = ok ? 'fa-check-circle text-success' : 'fa-times-circle text-muted';
        return `<span class="banpe-status-tag"><i class="fas ${ic}"></i> ${ok ? labelOk : labelNo}</span>`;
    };

    const banpeListTag = (ok) =>
        ok
            ? `<span class="banpe-status-tag banpe-status-tag--banpe-ok"><i class="fas fa-check-circle"></i> BANPE registrada</span>`
            : `<span class="banpe-status-tag"><i class="fas fa-times-circle text-muted"></i> Sin BANPE</span>`;

    enriched.forEach(({ patient, hasAnt, hasLip, hasHC, hasBanpe }) => {
        const el = document.createElement('div');
        el.className = 'patient-item';
        el.setAttribute('data-patient-id', String(patient.id));
        el.addEventListener('click', () => {
            if (typeof showToast === 'function') {
                showToast('Use los iconos a la derecha para registrar, editar o generar el reporte BANPE.', 'info');
            }
        });

        el.innerHTML = `
            <div class="patient-info">
                <h6><i class="fas fa-user"></i> Paciente ${banpeEscapeHtml(String(patient.id))}</h6>
                <div class="patient-status banpe-patient-status">
                    <p>${tagLine(hasAnt, 'Antropometría registrada', 'Sin antropometría')}</p>
                    <p>${tagLine(hasLip, 'Perfil lipídico registrado', 'Sin perfil lipídico')}</p>
                    <p>${tagLine(hasHC, 'Historia clínica registrada', 'Sin historia clínica')}</p>
                    <p>${banpeListTag(hasBanpe)}</p>
                </div>
            </div>
            <div class="patient-actions">
                <button type="button" class="edit-btn banpe-action-register" title="Registrar BANPE">
                    <i class="fas fa-plus-circle"></i>
                </button>
                <button type="button" class="edit-btn banpe-action-edit" title="Editar BANPE" ${hasBanpe ? '' : 'disabled'}>
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="report-btn banpe-action-report" title="Reporte BANPE para padres" ${
                    hasBanpe ? '' : 'disabled'
                }>
                    <i class="fas fa-file-medical-alt"></i>
                </button>
            </div>
        `;

        el.querySelector('.banpe-action-register').addEventListener('click', (ev) => {
            ev.stopPropagation();
            openBanpeRegistration(String(patient.id));
        });
        el.querySelector('.banpe-action-edit').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!hasBanpe) return;
            openBanpeEdit(String(patient.id));
        });
        el.querySelector('.banpe-action-report').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!hasBanpe) return;
            openBanpeParentReport(String(patient.id));
        });

        patientList.appendChild(el);
    });

    requestAnimationFrame(() => recalculateBanpeExpanderHeight());
}

function banpeToastStub(action, patientId) {
    if (typeof showToast === 'function') {
        showToast(`${action} (paciente ${patientId}): en desarrollo`, 'info');
    }
}

window.openBanpeRegistration = function (patientId) {
    if (!selectedBanpeDatabase || !selectedBanpeDatabase.data) {
        if (typeof showToast === 'function') showToast('Seleccione primero una base de datos.', 'error');
        return;
    }
    const row = selectedBanpeDatabase.data.find((r) => String(r.ID_Unico) === String(patientId));
    if (!row) {
        if (typeof showToast === 'function') showToast('No se encontró el paciente en la base de datos.', 'error');
        return;
    }

    ensureBanpeScoringTableBuilt();
    attachBanpeEvalDateListenerOnce();

    ['banpeAplicadorNombre', 'banpeAplicadorTelefono', 'banpeAplicadorCorreo', 'banpeAplicadorCargo'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('#banpeScoringTableMount .banpe-score-input').forEach((inp) => {
        inp.value = '';
    });
    banpeRecalculateAllTotals();
    banpeRefreshAllNormInterpretationStyles();

    if (typeof window.banpeApplyLoadData === 'function') window.banpeApplyLoadData(null);

    banpeFillPatientFromRow(row, patientId);

    const ptSel = document.getElementById('banpePatientSelector');
    const reg = document.getElementById('banpeRegistrationPanel');
    if (ptSel) ptSel.style.display = 'none';
    if (reg) reg.style.display = 'block';

    requestAnimationFrame(() => recalculateBanpeExpanderHeight());
};

window.closeBanpeRegistration = function () {
    const ptSel = document.getElementById('banpePatientSelector');
    const reg = document.getElementById('banpeRegistrationPanel');
    if (reg) reg.style.display = 'none';
    if (ptSel) ptSel.style.display = 'block';
    requestAnimationFrame(() => recalculateBanpeExpanderHeight());
};

window.saveBanpeRegistrationDraft = async function (options) {
    const keepOpen = !!(options && options.keepOpen);
    if (!selectedBanpeDatabase || !selectedBanpeDatabase.id) {
        if (typeof showToast === 'function') showToast('Seleccione una base de datos.', 'error');
        return false;
    }
    const patientId = document.getElementById('banpeRegPatientId')?.value?.trim();
    if (!patientId) {
        if (typeof showToast === 'function') showToast('No se identificó al paciente.', 'error');
        return false;
    }

    banpeApplyAllNormAutoFill();
    const registration = banpeSerializeRegistration();
    const pnorms = banpeCollectPnormsForSave();

    if (typeof showLoading === 'function') showLoading('Guardando evaluación BANPE…');
    try {
        const response = await fetch('/api/banpe/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                database_id: selectedBanpeDatabase.id,
                patient_id: patientId,
                registration,
                pnorms
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            const msg = result.detail || result.message || response.statusText || 'Error al guardar';
            if (typeof showToast === 'function') showToast(String(msg), 'error');
            return false;
        }

        const row = selectedBanpeDatabase.data?.find((r) => String(r.ID_Unico) === String(patientId));
        if (row) Object.assign(row, pnorms);

        if (typeof showToast === 'function') {
            showToast('Evaluación BANPE guardada en la base de datos (Excel + registro detallado).', 'success');
        }

        if (!keepOpen) {
            window.closeBanpeRegistration();
            if (typeof window.filterBanpePatients === 'function') window.filterBanpePatients();
            else await displayBanpePatients(allBanpePatients);
        }
        return true;
    } catch (e) {
        console.error('BANPE save', e);
        if (typeof showToast === 'function') showToast('Error de red al guardar BANPE.', 'error');
        return false;
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
};

window.openBanpeEdit = async function (patientId) {
    if (!selectedBanpeDatabase || !selectedBanpeDatabase.id) {
        if (typeof showToast === 'function') showToast('Seleccione una base de datos.', 'error');
        return;
    }
    const row = selectedBanpeDatabase.data?.find((r) => String(r.ID_Unico) === String(patientId));
    if (!row) {
        if (typeof showToast === 'function') showToast('No se encontró el paciente.', 'error');
        return;
    }

    if (typeof showLoading === 'function') showLoading('Cargando evaluación BANPE…');
    try {
        const response = await fetch(
            `/api/banpe/patient-data/${encodeURIComponent(selectedBanpeDatabase.id)}/${encodeURIComponent(String(patientId))}`
        );
        if (!response.ok) {
            if (typeof showToast === 'function') showToast('No se pudo cargar la evaluación guardada.', 'error');
            return;
        }
        const result = await response.json();
        if (!result.success || !result.registration) {
            if (typeof showToast === 'function') showToast('Respuesta inválida del servidor.', 'error');
            return;
        }

        ensureBanpeScoringTableBuilt();
        attachBanpeEvalDateListenerOnce();
        banpeFillPatientFromRow(row, patientId);
        banpeApplyRegistrationPayload(result.registration);

        const ptSel = document.getElementById('banpePatientSelector');
        const reg = document.getElementById('banpeRegistrationPanel');
        if (ptSel) ptSel.style.display = 'none';
        if (reg) reg.style.display = 'block';
        requestAnimationFrame(() => recalculateBanpeExpanderHeight());
    } catch (e) {
        console.error('BANPE openBanpeEdit', e);
        if (typeof showToast === 'function') showToast('Error al cargar la evaluación BANPE.', 'error');
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
};

window.openBanpeParentReport = function (patientId) {
    banpeToastStub('Reporte BANPE para padres', patientId);
};

window.selectBanpeDatabase = selectBanpeDatabase;

const BANPE_NORM_TABLE_ORDER = [
    'orientacion',
    'atencion',
    'memoria',
    'comprension',
    'expresion',
    'articulacion',
    'coordinacion',
    'habilidades',
    'inhibicion',
    'memoria_trabajo',
    'flexibilidad',
    'planeacion',
    'abstraccion',
    'teoria_mente'
];

const BANPE_NORM_MODAL_TITLES = {
    orientacion: 'Orientación total',
    atencion: 'Total atención y concentración',
    memoria: 'Total memoria',
    comprension: 'Total lenguaje — comprensión',
    expresion: 'Total lenguaje — expresión',
    articulacion: 'Total lenguaje — articulación',
    coordinacion: 'Total coordinación motora',
    habilidades: 'Total habilidades académicas',
    inhibicion: 'Total inhibición',
    memoria_trabajo: 'Total memoria de trabajo',
    flexibilidad: 'Total flexibilidad mental',
    planeacion: 'Total — planeación',
    abstraccion: 'Total — abstracción',
    teoria_mente: 'Total — teoría de la mente'
};

let banpeNormPersistTimer = null;
let banpeNormModalKeyHandler = null;
let banpeCodPersistTimer = null;
let banpeCodModalKeyHandler = null;
let banpePerfModalKeyHandler = null;

function banpeDeepCloneNormPayload() {
    const triplets = {};
    const src = window.BANPE_NORM_TRIPLETS || {};
    for (const k of Object.keys(src)) {
        triplets[k] = JSON.parse(JSON.stringify(src[k]));
    }
    return {
        triplets,
        rybTotal: JSON.parse(JSON.stringify(window.BANPE_NORM_RYB_TOTAL || []))
    };
}

function banpeApplyNormPayloadToWindow(p) {
    if (!p || !p.triplets) return;
    const triplets = JSON.parse(JSON.stringify(p.triplets));
    if (Array.isArray(triplets.planeacion) && triplets.planeacion.length > 19) {
        triplets.planeacion = triplets.planeacion.slice(0, 19);
    }
    /** Guardados antiguos: teoría con 10 filas era en realidad Total — abstracción. */
    if (!triplets.abstraccion && Array.isArray(triplets.teoria_mente) && triplets.teoria_mente.length === 10) {
        triplets.abstraccion = JSON.parse(JSON.stringify(triplets.teoria_mente));
        triplets.teoria_mente =
            p.rybGratif && Array.isArray(p.rybGratif) && p.rybGratif.length
                ? JSON.parse(JSON.stringify(p.rybGratif.slice(0, 3)))
                : [
                      [90, 82, 73],
                      [111, 102, 94],
                      [131, 122, 115]
                  ];
    }
    window.BANPE_NORM_TRIPLETS = triplets;
    window.BANPE_NORM_RYB_TOTAL = JSON.parse(JSON.stringify(p.rybTotal || []));
    /** Compatibilidad guardados v1: gratificación → filas de teoría de la mente (3). */
    if (p.rybGratif && Array.isArray(p.rybGratif) && p.rybGratif.length && window.BANPE_NORM_TRIPLETS.teoria_mente) {
        const tm = window.BANPE_NORM_TRIPLETS.teoria_mente;
        p.rybGratif.forEach((row, i) => {
            if (i < tm.length && Array.isArray(row)) {
                for (let c = 0; c < 3; c++) {
                    if (Number.isFinite(row[c])) tm[i][c] = row[c];
                }
            }
        });
    }
}

function banpeInitNormTablesFromDefaultsAndStorage() {
    if (window.__banpeNormInited) return;
    if (!window.BANPE_NORM_TRIPLETS) {
        console.warn(
            'BANPE: banpe-norm-data.js no está disponible (p. ej. falta la ruta /banpe-norm-data.js en el servidor).'
        );
        window.__banpeNormInited = true;
        return;
    }
    window.__banpeNormDefaultPayload = banpeDeepCloneNormPayload();
    const raw = localStorage.getItem(BANPE_NORM_LS_KEY);
    if (raw) {
        try {
            const o = JSON.parse(raw);
            if (o.triplets && typeof o.triplets === 'object') banpeApplyNormPayloadToWindow(o);
        } catch (e) {
            console.warn('BANPE: no se pudo leer tablas guardadas en localStorage', e);
        }
    }
    window.__banpeNormInited = true;
}

function banpePersistNormTablesNow() {
    try {
        localStorage.setItem(BANPE_NORM_LS_KEY, JSON.stringify(banpeDeepCloneNormPayload()));
        const hint = document.getElementById('banpeNormModalSaveHint');
        if (hint) {
            hint.textContent = 'Cambios guardados en este navegador';
            window.setTimeout(() => {
                if (hint.textContent === 'Cambios guardados en este navegador') hint.textContent = '';
            }, 2000);
        }
    } catch (e) {
        console.warn('BANPE: error guardando tablas', e);
    }
    banpeApplyAllNormAutoFill();
}

function banpeSchedulePersistNormTables() {
    const hint = document.getElementById('banpeNormModalSaveHint');
    if (hint) hint.textContent = 'Guardando…';
    if (banpeNormPersistTimer) window.clearTimeout(banpeNormPersistTimer);
    banpeNormPersistTimer = window.setTimeout(() => {
        banpeNormPersistTimer = null;
        banpePersistNormTablesNow();
    }, 450);
}

function banpeRebuildNormModalBody() {
    const mount = document.getElementById('banpeNormTablesModalBody');
    if (!mount) return;
    banpeInitNormTablesFromDefaultsAndStorage();
    if (!window.BANPE_NORM_TRIPLETS) {
        mount.innerHTML =
            '<p class="banpe-norm-modal-error">No se pudieron cargar las tablas. Compruebe que el servidor expone <code>banpe-norm-data.js</code>.</p>';
        return;
    }
    let html = '';
    for (const key of BANPE_NORM_TABLE_ORDER) {
        const rows = window.BANPE_NORM_TRIPLETS[key];
        if (!rows || !rows.length) continue;
        const title = BANPE_NORM_MODAL_TITLES[key] || key;
        html += `<section class="banpe-norm-edit-section"><h4>${banpeEscapeHtml(title)}</h4>`;
        html +=
            '<table class="banpe-norm-edit-table"><thead><tr><th>Puntuación Natural</th><th>3 a 3 años y 11 m</th><th>4 a 4 años y 11 m</th><th>5 a 5 años y 11 m</th></tr></thead><tbody>';
        rows.forEach((trip, idx) => {
            const nat = key === 'teoria_mente' ? idx : idx + 1;
            html += `<tr><td class="banpe-norm-edit-idx">${nat}</td>`;
            for (let c = 0; c < 3; c++) {
                const v = trip[c];
                const val = Number.isFinite(v) ? v : '';
                html += `<td><input type="number" step="1" class="banpe-norm-cell-input" data-banpe-norm-tbl="${key}" data-banpe-norm-row="${idx}" data-banpe-norm-col="${c}" value="${val}"></td>`;
            }
            html += '</tr>';
        });
        html += '</tbody></table></section>';
    }

    const t = window.BANPE_NORM_RYB_TOTAL || [];
    html += `<section class="banpe-norm-edit-section"><h4>${banpeEscapeHtml('Riesgo - Beneficio')}</h4>`;
    html +=
        '<table class="banpe-norm-edit-table"><thead><tr><th>Puntuación Natural</th><th>3 a 3 años y 11 m</th><th>4 a 4 años y 11 m</th><th>5 a 5 años y 11 m</th></tr></thead><tbody>';
    t.forEach((trip, idx) => {
        const nat = idx + 1;
        html += `<tr><td class="banpe-norm-edit-idx">${nat}</td>`;
        for (let c = 0; c < 3; c++) {
            const v = trip[c];
            html += `<td><input type="number" step="1" class="banpe-norm-cell-input" data-banpe-norm-tbl="_rybTotal" data-banpe-norm-row="${idx}" data-banpe-norm-col="${c}" value="${Number.isFinite(v) ? v : ''}"></td>`;
        }
        html += '</tr>';
    });
    html += '</tbody></table></section>';

    mount.innerHTML = html;
    mount.querySelectorAll('.banpe-norm-cell-input').forEach((inp) => {
        inp.addEventListener('input', banpeOnNormModalCellInput);
        inp.addEventListener('change', banpeOnNormModalCellInput);
    });
}

function banpeOnNormModalCellInput(ev) {
    const inp = ev.target;
    if (!inp.classList.contains('banpe-norm-cell-input')) return;
    const tbl = inp.getAttribute('data-banpe-norm-tbl');
    const r = parseInt(inp.getAttribute('data-banpe-norm-row'), 10);
    const c = parseInt(inp.getAttribute('data-banpe-norm-col'), 10);
    const v = parseFloat(inp.value);
    const num = Number.isFinite(v) ? Math.round(v) : 0;
    if (tbl === '_rybTotal' && window.BANPE_NORM_RYB_TOTAL && window.BANPE_NORM_RYB_TOTAL[r]) {
        window.BANPE_NORM_RYB_TOTAL[r][c] = num;
    } else if (tbl && window.BANPE_NORM_TRIPLETS[tbl] && window.BANPE_NORM_TRIPLETS[tbl][r]) {
        window.BANPE_NORM_TRIPLETS[tbl][r][c] = num;
    }
    banpeSchedulePersistNormTables();
}

window.openBanpeNormTablesModal = function () {
    banpeInitNormTablesFromDefaultsAndStorage();
    const modal = document.getElementById('banpeNormTablesModal');
    if (!modal) return;
    banpeRebuildNormModalBody();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (banpeNormModalKeyHandler) document.removeEventListener('keydown', banpeNormModalKeyHandler);
    banpeNormModalKeyHandler = (e) => {
        if (e.key === 'Escape') window.closeBanpeNormTablesModal();
    };
    document.addEventListener('keydown', banpeNormModalKeyHandler);
};

window.closeBanpeNormTablesModal = function () {
    const modal = document.getElementById('banpeNormTablesModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (banpeNormModalKeyHandler) {
        document.removeEventListener('keydown', banpeNormModalKeyHandler);
        banpeNormModalKeyHandler = null;
    }
    banpeApplyAllNormAutoFill();
};

window.banpeResetNormTablesToDefaults = function () {
    if (!window.__banpeNormDefaultPayload) {
        banpeInitNormTablesFromDefaultsAndStorage();
    }
    if (!window.__banpeNormDefaultPayload) return;
    banpeApplyNormPayloadToWindow(JSON.parse(JSON.stringify(window.__banpeNormDefaultPayload)));
    try {
        localStorage.removeItem(BANPE_NORM_LS_KEY);
    } catch (e) {
        /* ignore */
    }
    window.__banpeNormInited = true;
    banpeRebuildNormModalBody();
    banpeApplyAllNormAutoFill();
    if (typeof showToast === 'function') {
        showToast('Tablas restauradas a los valores del archivo.', 'info');
    }
};

const BANPE_COD_BAND_TITLES = [
    'Edad: 3 a 3 años y 11 meses',
    'Edad: 4 a 4 años y 11 meses',
    'Edad: 5 a 5 años y 11 meses'
];

function banpeMergeCodRowsWithDefaults(defRows, savedRows) {
    const byKey = {};
    if (Array.isArray(savedRows)) {
        savedRows.forEach((r) => {
            if (r && r.key) byKey[r.key] = r;
        });
    }
    return defRows.map((d) => {
        const s = byKey[d.key];
        if (!s || !Array.isArray(s.bands)) return JSON.parse(JSON.stringify(d));
        const bands = [[], [], []];
        for (let b = 0; b < 3; b++) {
            const srcB = s.bands[b];
            for (let c = 0; c < 5; c++) {
                const defCell = d.bands[b] && d.bands[b][c] != null ? String(d.bands[b][c]) : '';
                const sv = srcB && srcB[c] != null ? String(srcB[c]) : defCell;
                bands[b][c] = sv;
            }
        }
        return { key: d.key, label: d.label, bands };
    });
}

function banpeInitCodTablesFromDefaultsAndStorage() {
    if (window.__banpeCodInited) return;
    const src = window.BANPE_COD_TABLES_ROWS;
    if (!src || !Array.isArray(src) || !src.length) {
        console.warn('BANPE: banpe-cod-tables-data.js no está disponible.');
        window.__banpeCodInited = true;
        return;
    }
    window.__banpeCodDefaultRows = JSON.parse(JSON.stringify(src));
    const raw = localStorage.getItem(BANPE_COD_LS_KEY);
    if (raw) {
        try {
            const o = JSON.parse(raw);
            if (o && Array.isArray(o.rows)) {
                window.BANPE_COD_TABLES_ROWS = banpeMergeCodRowsWithDefaults(window.__banpeCodDefaultRows, o.rows);
            }
        } catch (e) {
            console.warn('BANPE: no se pudo leer tablas codificadas en localStorage', e);
        }
    }
    window.__banpeCodInited = true;
}

function banpeDeepCloneCodRows() {
    return JSON.parse(JSON.stringify(window.BANPE_COD_TABLES_ROWS || []));
}

function banpePersistCodTablesNow() {
    try {
        localStorage.setItem(BANPE_COD_LS_KEY, JSON.stringify({ rows: banpeDeepCloneCodRows() }));
        const hint = document.getElementById('banpeCodModalSaveHint');
        if (hint) {
            hint.textContent = 'Cambios guardados en este navegador';
            window.setTimeout(() => {
                if (hint.textContent === 'Cambios guardados en este navegador') hint.textContent = '';
            }, 2000);
        }
    } catch (e) {
        console.warn('BANPE: error guardando tablas codificadas', e);
    }
}

function banpeSchedulePersistCodTables() {
    const hint = document.getElementById('banpeCodModalSaveHint');
    if (hint) hint.textContent = 'Guardando…';
    if (banpeCodPersistTimer) window.clearTimeout(banpeCodPersistTimer);
    banpeCodPersistTimer = window.setTimeout(() => {
        banpeCodPersistTimer = null;
        banpePersistCodTablesNow();
    }, 450);
}

function banpeRebuildCodModalBody() {
    const mount = document.getElementById('banpeCodTablesModalBody');
    if (!mount) return;
    banpeInitCodTablesFromDefaultsAndStorage();
    if (!window.BANPE_COD_TABLES_ROWS || !window.BANPE_COD_TABLES_ROWS.length) {
        mount.innerHTML =
            '<p class="banpe-norm-modal-error">No se pudieron cargar las tablas codificadas. Compruebe que el servidor expone <code>banpe-cod-tables-data.js</code>.</p>';
        return;
    }
    const rows = window.BANPE_COD_TABLES_ROWS;
    let html = '';
    for (let b = 0; b < 3; b++) {
        html += `<section class="banpe-norm-edit-section"><h4>${banpeEscapeHtml(BANPE_COD_BAND_TITLES[b])}</h4>`;
        html +=
            '<table class="banpe-norm-edit-table banpe-cod-edit-table"><thead><tr><th class="banpe-cod-th-label">Medida / subprueba</th><th>Puntuación codificada 1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>';
        rows.forEach((row, ri) => {
            html += `<tr><td class="banpe-norm-edit-idx banpe-cod-td-label">${banpeEscapeHtml(row.label)}</td>`;
            for (let c = 0; c < 5; c++) {
                const v = row.bands[b] && row.bands[b][c] != null ? row.bands[b][c] : '';
                html += `<td><input type="text" class="banpe-cod-cell-input" data-banpe-cod-ri="${ri}" data-banpe-cod-bi="${b}" data-banpe-cod-ci="${c}" value="${banpeEscapeAttr(v)}" spellcheck="false" autocomplete="off"></td>`;
            }
            html += '</tr>';
        });
        html += '</tbody></table></section>';
    }
    mount.innerHTML = html;
    mount.querySelectorAll('.banpe-cod-cell-input').forEach((inp) => {
        inp.addEventListener('input', banpeOnCodModalCellInput);
        inp.addEventListener('change', banpeOnCodModalCellInput);
    });
}

function banpeOnCodModalCellInput(ev) {
    const inp = ev.target;
    if (!inp || !inp.classList.contains('banpe-cod-cell-input')) return;
    const ri = parseInt(inp.getAttribute('data-banpe-cod-ri'), 10);
    const bi = parseInt(inp.getAttribute('data-banpe-cod-bi'), 10);
    const ci = parseInt(inp.getAttribute('data-banpe-cod-ci'), 10);
    const rows = window.BANPE_COD_TABLES_ROWS;
    if (!rows || !rows[ri] || !rows[ri].bands || !rows[ri].bands[bi]) return;
    while (rows[ri].bands[bi].length < 5) rows[ri].bands[bi].push('');
    rows[ri].bands[bi][ci] = inp.value;
    banpeSchedulePersistCodTables();
}

window.openBanpeCodTablesModal = function () {
    banpeInitCodTablesFromDefaultsAndStorage();
    const modal = document.getElementById('banpeCodTablesModal');
    if (!modal) return;
    banpeRebuildCodModalBody();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (banpeCodModalKeyHandler) document.removeEventListener('keydown', banpeCodModalKeyHandler);
    banpeCodModalKeyHandler = (e) => {
        if (e.key === 'Escape') window.closeBanpeCodTablesModal();
    };
    document.addEventListener('keydown', banpeCodModalKeyHandler);
};

window.closeBanpeCodTablesModal = function () {
    const modal = document.getElementById('banpeCodTablesModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (banpeCodModalKeyHandler) {
        document.removeEventListener('keydown', banpeCodModalKeyHandler);
        banpeCodModalKeyHandler = null;
    }
};

window.banpeResetCodTablesToDefaults = function () {
    if (!window.__banpeCodDefaultRows) {
        banpeInitCodTablesFromDefaultsAndStorage();
    }
    if (!window.__banpeCodDefaultRows) return;
    window.BANPE_COD_TABLES_ROWS = JSON.parse(JSON.stringify(window.__banpeCodDefaultRows));
    try {
        localStorage.removeItem(BANPE_COD_LS_KEY);
    } catch (e) {
        /* ignore */
    }
    window.__banpeCodInited = true;
    banpeRebuildCodModalBody();
    if (typeof showToast === 'function') {
        showToast('Tablas codificadas restauradas a los valores predeterminados.', 'info');
    }
};

function banpeEscapeSvgText(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function banpePerfAbbrev(text, maxLen) {
    const t = String(text || '').trim();
    if (t.length <= maxLen) return t;
    return t.slice(0, Math.max(1, maxLen - 1)) + '…';
}

/** Zona de desempeño según puntuación normalizada (misma lógica que la tabla). */
function banpeNormPerfDotZone(n) {
    if (!Number.isFinite(n)) return '';
    if (n >= 116) return 'high';
    if (n >= 85) return 'mid';
    if (n >= 70) return 'leve';
    return 'low';
}

function banpePerfDotFill(zone) {
    if (zone === 'high') return '#1d4ed8';
    if (zone === 'mid') return '#16a34a';
    if (zone === 'leve') return '#eab308';
    if (zone === 'low') return '#dc2626';
    return '#94a3b8';
}

function banpeCollectPerformanceSeries() {
    const groups = banpeBuildAreaGroups();
    const cols = [];
    groups.forEach((group, gIdx) => {
        const normEl = document.getElementById(`banpe_norm_grp_${gIdx}`);
        const normRaw = normEl ? String(normEl.value || '').trim().replace(',', '.') : '';
        const nv = normRaw === '' ? NaN : parseFloat(normRaw);
        const areaNorm = Number.isFinite(nv) ? nv : null;
        group.forEach((row) => {
            const natEl = document.getElementById(`banpe_nat_${row.key}`);
            const nt = natEl ? String(natEl.value || '').trim().replace(',', '.') : '';
            const nn = nt === '' ? NaN : parseFloat(nt);
            cols.push({
                key: row.key,
                area: row.area,
                sub: row.sub,
                isTotal: !!row.isTotal,
                gIdx,
                areaNorm,
                natural: Number.isFinite(nn) ? nn : null
            });
        });
    });
    cols.forEach((c, i) => {
        c.xIdx = i;
    });
    const areaBands = [];
    groups.forEach((group, gIdx) => {
        const groupCols = cols.filter((c) => c.gIdx === gIdx);
        if (!groupCols.length) return;
        const xs = groupCols.map((c) => c.xIdx);
        areaBands.push({
            gIdx,
            area: group[0].area,
            xCenter: (Math.min(...xs) + Math.max(...xs)) / 2,
            norm: groupCols[0].areaNorm
        });
    });
    return { cols, areaBands, n: cols.length };
}

function banpePerfFormatNatLabel(n) {
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
}

function banpePerfFormatNormLabel(n) {
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 10) / 10);
}

/** Marcas del eje de 0 a yMax (incluye yMax). Paso 20 u otro según el rango. */
function banpePerfAxisTicks0To(yMax) {
    const maxV = Math.max(0, Math.round(Number(yMax) || 0));
    const ticks = [0];
    if (maxV < 1) return ticks;
    let step = 20;
    if (maxV > 220) step = 25;
    if (maxV > 400) step = 50;
    for (let v = step; v < maxV - 1e-9; v += step) ticks.push(Math.round(v));
    const last = ticks[ticks.length - 1];
    if (last < maxV - 1e-6) ticks.push(maxV);
    return ticks;
}

function banpeRebuildPerformanceChart() {
    const mount = document.getElementById('banpePerformanceModalBody');
    if (!mount) return;

    banpeApplyAllNormAutoFill();
    const { cols, areaBands, n: nAll } = banpeCollectPerformanceSeries();
    if (!nAll) {
        mount.innerHTML = '<p class="banpe-norm-modal-error">No hay columnas para graficar.</p>';
        return;
    }

    /* Solo subpruebas (sin filas de total por área): menos ancho y eje X más claro */
    const plotCols = cols.filter((c) => !c.isTotal).map((c, plotIdx) => ({ ...c, plotIdx }));
    if (!plotCols.length) {
        mount.innerHTML = '<p class="banpe-norm-modal-error">No hay subpruebas para graficar.</p>';
        return;
    }
    const n = plotCols.length;

    const areaBandsPlot = [];
    areaBands.forEach((b) => {
        const inG = plotCols.filter((c) => c.gIdx === b.gIdx);
        if (!inG.length) return;
        const pxs = inG.map((c) => c.plotIdx);
        areaBandsPlot.push({
            gIdx: b.gIdx,
            area: b.area,
            xCenter: (Math.min(...pxs) + Math.max(...pxs)) / 2,
            norm: b.norm
        });
    });

    const colW = 58;
    const ml = 60;
    const mr = 60;
    const headerTop = 6;
    const areaHeaderH = 54;
    const plotGap = 8;
    const plotTop = headerTop + areaHeaderH + plotGap;
    const mb = 118;
    const plotW = n * colW;
    const plotH = 380;
    const W = Math.max(ml + plotW + mr, 920);
    const H = plotTop + plotH + mb;

    const innerL = ml;
    const innerR = ml + plotW;
    const innerT = plotTop;
    const innerB = plotTop + plotH;
    const headerRowY = headerTop;
    const headerRowH = areaHeaderH;

    /* Tope vertical: mínimo 140; si hay naturales o normalizadas mayores, sube (p. ej. 145 → 150) */
    let yPeak = 140;
    plotCols.forEach((c) => {
        if (c.natural != null && Number.isFinite(c.natural)) yPeak = Math.max(yPeak, c.natural);
    });
    areaBandsPlot.forEach((b) => {
        if (b.norm != null && Number.isFinite(b.norm)) yPeak = Math.max(yPeak, b.norm);
    });
    yPeak = Math.max(yPeak, 115);
    const Y_SCALE_MIN = 0;
    const BASE_Y_MAX = 140;
    const Y_SCALE_MAX = yPeak <= BASE_Y_MAX + 1e-9 ? BASE_Y_MAX : Math.ceil(yPeak / 10) * 10;
    const axisTicks = banpePerfAxisTicks0To(Y_SCALE_MAX);

    const yAt = (rawVal) => {
        const v = Number(rawVal);
        if (!Number.isFinite(v)) return innerB;
        const c = Math.max(Y_SCALE_MIN, Math.min(Y_SCALE_MAX, v));
        const t = (c - Y_SCALE_MIN) / (Y_SCALE_MAX - Y_SCALE_MIN || 1);
        return innerB - t * plotH;
    };

    const xCol = (plotIdx) => innerL + (plotIdx + 0.5) * colW;

    const parts = [];
    parts.push(
        `<div class="banpe-perf-legend">` +
            `<span><i style="background:#b91c1c"></i> Línea roja: <strong>natural</strong> por subprueba (eje 0–${Y_SCALE_MAX})</span>` +
            `<span><i style="background:#2563eb;height:3px"></i> Línea azul: <strong>normalizada</strong> por área (mismo eje 0–${Y_SCALE_MAX})</span>` +
            `<span style="color:#1d4ed8">● Normal Alto (≥116)</span>` +
            `<span style="color:#16a34a">● Normal (85–115)</span>` +
            `<span style="color:#eab308">● Alteración leve (70–84)</span>` +
            `<span style="color:#dc2626">● Alteración severa (≤69)</span>` +
            `</div>`
    );
    parts.push(
        `<p class="banpe-perf-hint">En la franja superior, cada recuadro muestra el nombre del área y cubre las columnas de sus subpruebas; las líneas verticales discontinuas marcan el cambio de área. Cada columna es una subprueba. A izquierda y derecha aparece la misma escala vertical, de <strong>0</strong> a <strong>${Y_SCALE_MAX}</strong>. Las bandas de color de fondo orientan la clasificación según la puntuación normalizada: <strong>azul</strong> Normal Alto (≥116), <strong>verde</strong> Normal (85–115), <strong>ámbar</strong> Alteración leve (70–84) y <strong>rojo</strong> Alteración severa (≤69). La <strong>línea roja</strong> conecta las puntuaciones naturales de cada subprueba; la <strong>línea azul</strong> conecta las puntuaciones normalizadas por área en el centro de cada bloque. Los puntos se colorean según la zona de desempeño asociada a la normalizada del área.</p>`
    );
    parts.push(`<div class="banpe-perf-scroll"><svg class="banpe-perf-chart" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

    /* Fila de cabeceras alineada con columnas (celdas de tabla) */
    for (let gi = 0; gi < areaBandsPlot.length; gi++) {
        const g = areaBandsPlot[gi];
        const groupCols = plotCols.filter((c) => c.gIdx === g.gIdx);
        if (!groupCols.length) continue;
        const i0 = Math.min(...groupCols.map((c) => c.plotIdx));
        const i1 = Math.max(...groupCols.map((c) => c.plotIdx));
        const x0 = innerL + i0 * colW;
        const x1 = innerL + (i1 + 1) * colW;
        const cellW = x1 - x0;
        const areaStr = String(g.area || '');
        parts.push(
            `<rect x="${x0}" y="${headerRowY}" width="${cellW}" height="${headerRowH}" fill="#e0e7ff" stroke="#6366f1" stroke-width="1" />`
        );
        parts.push(
            `<foreignObject x="${x0}" y="${headerRowY}" width="${cellW}" height="${headerRowH}">` +
                `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;max-height:100%;padding:3px 4px;margin:0;text-align:center;font-size:8px;font-weight:600;color:#312e81;line-height:1.15;word-break:break-word;overflow-wrap:anywhere;hyphens:auto;display:flex;align-items:center;justify-content:center;overflow-y:auto;background:transparent;">${banpeEscapeHtml(
                    areaStr
                )}</div>` +
                `</foreignObject>`
        );
    }

    /* Fondos de bandas según clasificación: ≥116 azul, 85–115 verde, 70–84 ámbar, ≤69 rojo */
    const yHighBot = yAt(115.5);
    const yNormalBot = yAt(84.5);
    const yLeveBot = yAt(69.5);
    parts.push(
        `<rect x="${innerL}" y="${innerT}" width="${plotW}" height="${Math.max(0, yHighBot - innerT)}" fill="#bfdbfe" fill-opacity="0.7" />`
    );
    parts.push(
        `<rect x="${innerL}" y="${yHighBot}" width="${plotW}" height="${Math.max(0, yNormalBot - yHighBot)}" fill="#bbf7d0" fill-opacity="0.7" />`
    );
    parts.push(
        `<rect x="${innerL}" y="${yNormalBot}" width="${plotW}" height="${Math.max(0, yLeveBot - yNormalBot)}" fill="#fde68a" fill-opacity="0.8" />`
    );
    parts.push(
        `<rect x="${innerL}" y="${yLeveBot}" width="${plotW}" height="${Math.max(0, innerB - yLeveBot)}" fill="#fecaca" fill-opacity="0.7" />`
    );

    /* Separadores verticales discontinuos: borde entre áreas (cabecera + gráfico) */
    for (let i = 1; i < n; i++) {
        if (plotCols[i].gIdx === plotCols[i - 1].gIdx) continue;
        const xv = innerL + i * colW;
        parts.push(
            `<line x1="${xv}" y1="${headerRowY}" x2="${xv}" y2="${innerB}" stroke="#64748b" stroke-width="1.25" stroke-dasharray="7 5" stroke-opacity="0.85" />`
        );
    }

    /* Cuadrícula horizontal alineada a las marcas del eje */
    axisTicks.forEach((v) => {
        const y = yAt(v);
        if (y < innerT - 0.5 || y > innerB + 0.5) return;
        parts.push(
            `<line x1="${innerL}" y1="${y}" x2="${innerR}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`
        );
    });

    /* Ejes */
    parts.push(`<line x1="${innerL}" y1="${innerB}" x2="${innerR}" y2="${innerB}" stroke="#64748b" stroke-width="2" />`);
    parts.push(`<line x1="${innerL}" y1="${innerT}" x2="${innerL}" y2="${innerB}" stroke="#64748b" stroke-width="2" />`);
    parts.push(`<line x1="${innerR}" y1="${innerT}" x2="${innerR}" y2="${innerB}" stroke="#64748b" stroke-width="2" />`);

    /* Marcas del eje (iguales a izquierda y derecha) */
    axisTicks.forEach((v) => {
        const y = yAt(v);
        parts.push(`<line x1="${innerL - 6}" y1="${y}" x2="${innerL}" y2="${y}" stroke="#64748b" stroke-width="1" />`);
        parts.push(
            `<text x="${innerL - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#475569">${banpeEscapeSvgText(String(v))}</text>`
        );
    });
    parts.push(
        `<text x="${innerL - 52}" y="${innerT + plotH / 2}" text-anchor="middle" font-size="11" fill="#b91c1c" transform="rotate(-90 ${innerL - 52},${
            innerT + plotH / 2
        })">Natural</text>`
    );

    axisTicks.forEach((v) => {
        const y = yAt(v);
        parts.push(`<line x1="${innerR}" y1="${y}" x2="${innerR + 6}" y2="${y}" stroke="#64748b" stroke-width="1" />`);
        parts.push(
            `<text x="${innerR + 10}" y="${y + 4}" text-anchor="start" font-size="10" fill="#475569">${banpeEscapeSvgText(String(v))}</text>`
        );
    });
    parts.push(
        `<text x="${innerR + 52}" y="${innerT + plotH / 2}" text-anchor="middle" font-size="11" fill="#2563eb" transform="rotate(90 ${innerR + 52},${
            innerT + plotH / 2
        })">Normalizada</text>`
    );

    /* Etiquetas X: solo subpruebas (sin totales) */
    plotCols.forEach((c) => {
        const x = xCol(c.plotIdx);
        const lab = banpePerfAbbrev(c.sub, 28);
        parts.push(
            `<text x="${x}" y="${innerB + 14}" text-anchor="end" font-size="9" fill="#334155" transform="rotate(-58 ${x},${innerB + 14})">${banpeEscapeSvgText(
                lab
            )}</text>`
        );
    });

    /* Línea roja: naturales por subprueba */
    const redPts = plotCols
        .filter((c) => c.natural != null && Number.isFinite(c.natural))
        .map((c) => ({
            x: xCol(c.plotIdx),
            y: yAt(c.natural),
            n: c.natural,
            zone: banpeNormPerfDotZone(c.areaNorm)
        }));
    if (redPts.length >= 2) {
        const d = redPts.map((p) => `${p.x},${p.y}`).join(' ');
        parts.push(`<polyline fill="none" stroke="#b91c1c" stroke-width="2.5" stroke-linejoin="round" points="${d}" />`);
    }
    redPts.forEach((p) => {
        const fill = banpePerfDotFill(p.zone || 'mid');
        parts.push(`<circle cx="${p.x}" cy="${p.y}" r="5" fill="${fill}" stroke="#7f1d1d" stroke-width="1" />`);
    });
    redPts.forEach((p) => {
        const above = p.y >= innerT + 20;
        const ty = above ? p.y - 10 : p.y + 14;
        parts.push(
            `<text x="${p.x}" y="${ty}" text-anchor="middle" font-size="9" font-weight="700" fill="#991b1b">${banpeEscapeSvgText(
                banpePerfFormatNatLabel(p.n)
            )}</text>`
        );
    });

    /* Línea azul: normalizada por área (centro del bloque de subpruebas del área) */
    const bluePts = areaBandsPlot
        .filter((b) => b.norm != null && Number.isFinite(b.norm))
        .map((b) => ({
            x: innerL + (b.xCenter + 0.5) * colW,
            y: yAt(b.norm),
            z: b.norm,
            zone: banpeNormPerfDotZone(b.norm)
        }));
    if (bluePts.length >= 2) {
        const d = bluePts.map((p) => `${p.x},${p.y}`).join(' ');
        parts.push(`<polyline fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round" points="${d}" />`);
    }
    bluePts.forEach((p) => {
        const fill = banpePerfDotFill(p.zone);
        parts.push(`<circle cx="${p.x}" cy="${p.y}" r="7" fill="${fill}" stroke="#1e3a8a" stroke-width="1.5" />`);
    });
    bluePts.forEach((p) => {
        const above = p.y >= innerT + 22;
        const ty = above ? p.y - 12 : p.y + 16;
        parts.push(
            `<text x="${p.x}" y="${ty}" text-anchor="middle" font-size="10" font-weight="700" fill="#1e40af">${banpeEscapeSvgText(
                banpePerfFormatNormLabel(p.z)
            )}</text>`
        );
    });

    parts.push('</svg></div>');
    mount.innerHTML = parts.join('');
}

window.openBanpePerformanceModal = function () {
    const reg = document.getElementById('banpeRegistrationPanel');
    if (!reg || reg.style.display === 'none') {
        if (typeof showToast === 'function') showToast('Abra el formulario de registro BANPE para ver Performance.', 'info');
        return;
    }
    ensureBanpeScoringTableBuilt();
    banpeInitNormTablesFromDefaultsAndStorage();
    banpeApplyAllNormAutoFill();

    const modal = document.getElementById('banpePerformanceModal');
    if (!modal) return;
    const title = document.getElementById('banpePerformanceModalTitle');
    const pid = document.getElementById('banpeRegPatientId')?.value?.trim() || '';
    if (title) {
        title.innerHTML =
            '<i class="fas fa-chart-area"></i> Performance BANPE' +
            (pid ? ` — <span class="banpe-perf-pid">${banpeEscapeHtml(pid)}</span>` : '');
    }
    banpeRebuildPerformanceChart();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (banpePerfModalKeyHandler) document.removeEventListener('keydown', banpePerfModalKeyHandler);
    banpePerfModalKeyHandler = (e) => {
        if (e.key === 'Escape') window.closeBanpePerformanceModal();
    };
    document.addEventListener('keydown', banpePerfModalKeyHandler);
};

window.closeBanpePerformanceModal = function () {
    const modal = document.getElementById('banpePerformanceModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (banpePerfModalKeyHandler) {
        document.removeEventListener('keydown', banpePerfModalKeyHandler);
        banpePerfModalKeyHandler = null;
    }
};

window.toggleBanpeExpander = function () {
    const content = document.getElementById('banpeExpanderContent');
    const icon = document.getElementById('banpeExpanderIcon');
    if (!content || !icon) return;

    if (content.classList.contains('expanded')) {
        content.style.maxHeight = `${content.scrollHeight}px`;
        void content.offsetHeight;
        content.classList.remove('expanded');
        icon.classList.remove('expanded');
        requestAnimationFrame(() => {
            content.style.maxHeight = '0';
        });
    } else {
        content.classList.add('expanded');
        icon.classList.add('expanded');
        content.style.maxHeight = content.scrollHeight + 'px';
        loadBanpeDatabases();
        window.setTimeout(() => recalculateBanpeExpanderHeight(), 350);
    }
};

banpeInitNormTablesFromDefaultsAndStorage();
banpeInitCodTablesFromDefaultsAndStorage();
