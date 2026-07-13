/**
 * Análisis descriptivo — subsecciones 1.1 a 1.4 con gráficos Plotly.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let schema = null;
    let plotCounter = 0;
    let desc11LastCol = null;

    function plotId(prefix) {
        plotCounter += 1;
        return prefix + '-' + plotCounter;
    }

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    function fillSelect(sel, columns, selected) {
        if (!sel) return;
        sel.innerHTML =
            '<option value="">— Seleccione —</option>' +
            (columns || [])
                .map(function (c) {
                    const s = c === selected ? ' selected' : '';
                    return '<option value="' + App().escapeHtml(c) + '"' + s + '>' + App().escapeHtml(c) + '</option>';
                })
                .join('');
    }

    function fillMultiSelect(sel, columns, selectedList) {
        if (!sel) return;
        const set = new Set(selectedList || []);
        sel.innerHTML = (columns || [])
            .map(function (c) {
                const s = set.has(c) ? ' selected' : '';
                return '<option value="' + App().escapeHtml(c) + '"' + s + '>' + App().escapeHtml(c) + '</option>';
            })
            .join('');
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            schema = null;
            showNoDataMessage(true);
            return;
        }
        showNoDataMessage(false);
        try {
            const res = await fetch(API() + '/datasets/' + encodeURIComponent(id) + '/descriptivo/schema');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error al cargar esquema');
            schema = data;
            populateAllSelectors();
        } catch (err) {
            schema = null;
            App().showToast(err.message, 'error');
        }
    }

    function showNoDataMessage(show) {
        const el = document.getElementById('analysisDescNoData');
        const content = document.getElementById('analysisDescContent');
        if (el) el.hidden = !show;
        if (content) content.hidden = show;
    }

    function populateAllSelectors() {
        if (!schema) return;
        const all = schema.columns || [];
        const num = schema.numeric_columns || [];
        const cat = schema.categorical_columns || [];
        const weight = schema.suggested_weight_column || '';

        fillSelect(document.getElementById('desc11Var'), all);
        updateDesc11DistribPor();
        updateDesc11CompararPor();

        fillSelect(document.getElementById('desc12AnthroVar'), schema.presets?.anthropometric || []);
        fillSelect(document.getElementById('desc12LipidVar'), schema.presets?.lipid || []);
        fillSelect(document.getElementById('desc12GroupBy'), cat, weight);

        initDesc13PcpSelectors();
        initDesc13HeatmapSort();
        initDesc13RadarCompare();
        initDesc13DensitySelectors();
        initDesc13ScatterStratify();
        initDesc13AlluvialUi();

        fillMultiSelect(document.getElementById('desc14Vars'), num, schema.presets?.correlation);
        resizeDesc14Multiselect();
        initDesc14Presets();
        initDesc14PairPresets();
        initDesc14CustomScatterSelectors();
        updateDesc14ConditionLabel();
        updateDesc11CompareUI();
    }

    function resizeDesc14Multiselect() {
        const sel = document.getElementById('desc14Vars');
        if (!sel) return;
        const n = sel.options.length;
        sel.size = Math.max(n, 4);
    }

    function applyDesc14Selection(columns) {
        fillMultiSelect(document.getElementById('desc14Vars'), schema.numeric_columns || [], columns);
        resizeDesc14Multiselect();
    }

    function updateDesc14ConditionLabel() {
        const el = document.getElementById('desc14ConditionLabel');
        if (el && schema?.suggested_weight_column) {
            el.textContent = schema.suggested_weight_column;
        }
    }

    function getDesc14PresetById(id) {
        return (schema?.presets?.correlation_presets || []).find(function (p) {
            return p.id === id;
        });
    }

    function showDesc14PresetInfo(presetId) {
        const preset = getDesc14PresetById(presetId);
        if (!preset) return;
        const cancelBtn = document.getElementById('analysisConfirmCancelBtn');
        const iconWrap = document.getElementById('analysisConfirmIcon');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (iconWrap) {
            const icon = iconWrap.querySelector('i');
            if (icon) icon.className = 'fas fa-info-circle';
        }
        App()
            .confirm({
                title: preset.label,
                message: preset.info,
                confirmText: 'Entendido',
                cancelText: 'Cerrar'
            })
            .finally(function () {
                if (cancelBtn) cancelBtn.style.display = '';
            });
    }

    function initDesc14Presets() {
        const mount = document.getElementById('desc14Presets');
        if (!mount || !schema) return;
        const presets = schema.presets?.correlation_presets || [];
        let html = '';
        presets.forEach(function (p, idx) {
            const checked = idx === 0 ? ' checked' : '';
            html +=
                '<label class="analysis-corr-preset">' +
                '<input type="radio" name="desc14Preset" value="' +
                App().escapeHtml(p.id) +
                '"' +
                checked +
                ' />' +
                '<span>' +
                App().escapeHtml(p.label) +
                '</span>' +
                '<button type="button" class="analysis-corr-info-btn" data-preset-id="' +
                App().escapeHtml(p.id) +
                '" title="¿Por qué correlacionar estas variables?" aria-label="Información sobre ' +
                App().escapeHtml(p.label) +
                '"><i class="fas fa-info-circle"></i></button>' +
                '</label>';
        });
        html +=
            '<label class="analysis-corr-preset">' +
            '<input type="radio" name="desc14Preset" value="other" />' +
            '<span>Otro (selección manual)</span>' +
            '</label>';
        mount.innerHTML = html;
        if (presets.length) {
            applyDesc14Selection(presets[0].columns);
        }
        mount.querySelectorAll('input[name="desc14Preset"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (radio.value === 'other') return;
                const preset = getDesc14PresetById(radio.value);
                if (preset) applyDesc14Selection(preset.columns);
            });
        });
        mount.querySelectorAll('.analysis-corr-info-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                showDesc14PresetInfo(btn.getAttribute('data-preset-id'));
            });
        });
    }

    function isNumericColumn(col) {
        if (!col || !schema) return false;
        const types = schema.variable_types || {};
        const t = types[col];
        return t === 'numeric_discrete' || t === 'numeric_continuous';
    }

    function updateDesc11DistribPor() {
        const col = document.getElementById('desc11Var')?.value;
        const sel = document.getElementById('desc11BoxGroup');
        if (!sel || !schema) return;
        const prev = sel.value;
        let options = [];
        if (col && isNumericColumn(col)) {
            options = (schema.categorical_columns || []).filter(function (c) {
                return c !== col;
            });
        } else if (col) {
            options = (schema.numeric_columns || []).filter(function (c) {
                return c !== col;
            });
        }
        fillSelect(sel, options);
        if (prev && options.indexOf(prev) !== -1) {
            sel.value = prev;
        } else {
            sel.value = '';
        }
    }

    function updateDesc11CompararPor() {
        const col = document.getElementById('desc11Var')?.value;
        const sel = document.getElementById('desc11GroupBy');
        if (!sel || !schema) return;
        const prev = sel.value;
        const weight = schema.suggested_weight_column || '';
        const options = (schema.categorical_columns || []).filter(function (c) {
            return c !== col;
        });
        fillSelect(sel, options, weight && options.indexOf(weight) !== -1 ? weight : '');
        if (prev && options.indexOf(prev) !== -1) {
            sel.value = prev;
        } else if (weight && options.indexOf(weight) !== -1) {
            sel.value = weight;
        } else {
            sel.value = '';
        }
    }

    function updateDesc11CompareUI() {
        const col = document.getElementById('desc11Var')?.value;
        const groupBy = document.getElementById('desc11GroupBy')?.value;
        const section = document.getElementById('desc11CompareSection');
        const title = document.getElementById('desc11CompareTitle');
        const compareMount = document.getElementById('desc11CompareResults');
        if (!section || !title) return;
        const mainMount = document.getElementById('desc11Results');
        const hasMain = mainMount && mainMount.innerHTML.trim().length > 0;
        if (!col || !hasMain) {
            section.hidden = true;
            return;
        }
        section.hidden = false;
        if (groupBy) {
            title.textContent = 'Distribución de ' + col + ' por ' + groupBy;
            title.hidden = false;
        } else {
            title.hidden = true;
            if (compareMount) compareMount.innerHTML = '';
        }
    }

    async function refreshDesc11Comparison() {
        const col = desc11LastCol || document.getElementById('desc11Var')?.value;
        const groupBy = document.getElementById('desc11GroupBy')?.value;
        const compareMount = document.getElementById('desc11CompareResults');
        const mainMount = document.getElementById('desc11Results');
        if (!col || !groupBy || !compareMount || !mainMount || !mainMount.innerHTML.trim()) {
            if (compareMount && !groupBy) compareMount.innerHTML = '';
            updateDesc11CompareUI();
            return;
        }
        updateDesc11CompareUI();
        App().showLoading('Actualizando comparación...');
        try {
            await renderDesc11Comparison(col, groupBy, compareMount);
        } catch (err) {
            compareMount.innerHTML =
                '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function postJson(path, body) {
        const id = getDatasetId();
        if (!id) throw new Error('No hay base de datos activa');
        const res = await fetch(API() + '/datasets/' + encodeURIComponent(id) + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error en el análisis');
        return data;
    }

    const NUMERIC_TABLE_HEADERS = new Set([
        'n',
        '%',
        '% fila',
        'Media',
        'Mediana',
        'DE',
        'Varianza',
        'Mín',
        'Máx',
        'Q1',
        'Q3',
        'RIC'
    ]);

    function isNumericTableColumn(header) {
        return NUMERIC_TABLE_HEADERS.has(header);
    }

    function formatTableCell(header, cell) {
        if (cell == null || cell === '') return '';
        const raw = String(cell);
        if (header === 'n') {
            const n = Number(cell);
            return Number.isFinite(n) ? String(Math.round(n)) : raw;
        }
        if (header === '%' || header === '% fila') {
            const p = Number(cell);
            return Number.isFinite(p) ? p.toFixed(2) + '%' : raw;
        }
        if (isNumericTableColumn(header)) {
            const v = Number(cell);
            if (Number.isFinite(v)) {
                return Number.isInteger(v) ? String(v) : v.toFixed(2);
            }
        }
        return raw;
    }

    function renderTableHtml(headers, rows) {
        let h = '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>';
        headers.forEach(function (x) {
            const cls = isNumericTableColumn(x) ? ' class="num"' : '';
            h += '<th scope="col"' + cls + '>' + App().escapeHtml(x) + '</th>';
        });
        h += '</tr></thead><tbody>';
        rows.forEach(function (row) {
            h += '<tr>';
            row.forEach(function (cell, ci) {
                const cls = isNumericTableColumn(headers[ci]) ? ' class="num"' : '';
                h += '<td' + cls + '>' + App().escapeHtml(formatTableCell(headers[ci], cell)) + '</td>';
            });
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    const PLOTLY_PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

    function hexToRgba(hex, alpha) {
        const h = String(hex || '').replace('#', '');
        if (h.length !== 6) return 'rgba(37, 99, 235, ' + alpha + ')';
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function plotlyConfig(overrides) {
        return window.AnalysisPlotly
            ? window.AnalysisPlotly.config(overrides)
            : { responsive: true, displayModeBar: 'hover' };
    }

    function plotTitle(text) {
        if (window.AnalysisPlotly && window.AnalysisPlotly.plotTitle) {
            return window.AnalysisPlotly.plotTitle(text);
        }
        return {
            text: text,
            x: 0.5,
            xanchor: 'center',
            pad: { t: 12, b: 6 }
        };
    }

    function plotHistogram(containerId, hist) {
        if (!window.Plotly || !hist) return;
        const trace1 = {
            x: hist.bin_centers,
            y: hist.counts,
            type: 'bar',
            name: 'Frecuencia',
            marker: { color: '#3b82f6', opacity: 0.75 }
        };
        const trace2 = {
            x: hist.density_curve?.x || [],
            y: hist.density_curve?.y || [],
            type: 'scatter',
            mode: 'lines',
            name: 'Curva normal ref.',
            line: { color: '#dc2626', width: 2 }
        };
        Plotly.newPlot(
            containerId,
            [trace1, trace2],
            {
                margin: { t: 56, b: 50, l: 50, r: 20 },
                title: plotTitle('Histograma'),
                xaxis: { title: 'Valor' },
                yaxis: { title: 'Frecuencia' },
                showlegend: true,
                legend: { orientation: 'h', y: 1.12, x: 0.5, xanchor: 'center' }
            },
            plotlyConfig()
        );
    }

    function plotBoxplot(containerId, groups, layoutExtra) {
        if (!window.Plotly || !groups || !groups.length) return;
        const active = groups.filter(function (g) {
            return g.n && (g.values?.length || g.points?.length);
        });
        const multi = active.length > 1;
        const traces = [];
        active.forEach(function (g, gi) {
            const ys = g.values || (g.points || []).map(function (p) {
                return p.y;
            });
            if (!ys.length) return;
            const color = multi ? PLOTLY_PALETTE[gi % PLOTLY_PALETTE.length] : '#2563eb';
            traces.push({
                type: 'box',
                name: multi ? g.label : 'Observaciones',
                y: ys,
                boxpoints: 'all',
                jitter: 0.38,
                pointpos: multi ? -1.65 : 0,
                boxmean: false,
                marker: {
                    color: color,
                    size: 6,
                    opacity: 0.72,
                    line: { width: 0.6, color: '#ffffff' }
                },
                line: { color: color, width: 2.5 },
                fillcolor: hexToRgba(color, 0.2),
                whiskerwidth: 0.6
            });
        });
        const layout = Object.assign(
            {
                margin: { t: 48, b: 60, l: 50, r: 20 },
                title: plotTitle('Diagrama de caja'),
                yaxis: { title: 'Valor' },
                showlegend: multi
            },
            layoutExtra || {}
        );
        if (layout.title && typeof layout.title === 'string') {
            layout.title = plotTitle(layout.title);
        }
        if (layout.title === '') {
            delete layout.title;
        }
        Plotly.newPlot(containerId, traces, layout, plotlyConfig());
    }

    function plotPie(containerId, frequencies) {
        if (!window.Plotly || !frequencies) return;
        const el = document.getElementById(containerId);
        if (el) {
            el.classList.add('analysis-chart-pie');
        }
        Plotly.newPlot(
            containerId,
            [
                {
                    type: 'pie',
                    labels: frequencies.map(function (f) {
                        return f.category;
                    }),
                    values: frequencies.map(function (f) {
                        return f.count;
                    }),
                    textinfo: 'label+percent',
                    textposition: 'outside',
                    automargin: true,
                    marker: {
                        line: { color: '#fff', width: 1 }
                    }
                }
            ],
            {
                margin: { t: 56, b: 72, l: 48, r: 48 },
                title: plotTitle('Distribución'),
                showlegend: true,
                legend: { orientation: 'v', x: 1.02, y: 0.5 }
            },
            plotlyConfig()
        );
    }

    function corrMethodLabel(method) {
        if (method === 'pearson') return 'Pearson (r)';
        if (method === 'spearman') return 'Spearman (ρ)';
        if (method === 'per_pair') return 'Mixto por par (P / S en celdas)';
        return method || 'Spearman (ρ)';
    }

    function corrMethodTag(method) {
        if (method === 'pearson') return 'P';
        if (method === 'spearman') return 'S';
        return '';
    }

    function renderNormalityTable(normality) {
        if (!normality || !normality.length) return '';
        let rows = '';
        normality.forEach(function (item) {
            const normal = item.normal;
            const p = item.p_value != null ? String(item.p_value) : '—';
            const n = item.n != null ? String(item.n) : '—';
            const note = item.note ? ' · ' + App().escapeHtml(item.note) : '';
            rows +=
                '<tr><td>' +
                App().escapeHtml(item.variable || '—') +
                '</td><td>' +
                (normal ? 'Sí' : 'No') +
                '</td><td>' +
                App().escapeHtml(p) +
                '</td><td>' +
                App().escapeHtml(n) +
                '</td><td class="analysis-corr-norm-note">' +
                App().escapeHtml(item.test || 'shapiro') +
                note +
                '</td></tr>';
        });
        return (
            '<details class="analysis-corr-norm-details">' +
            '<summary>Normalidad por variable (Shapiro-Wilk, α=0,05)</summary>' +
            '<div class="analysis-table-wrap">' +
            '<table class="analysis-table analysis-table-compact">' +
            '<thead><tr><th>Variable</th><th>Normal</th><th>p</th><th>n</th><th>Prueba</th></tr></thead>' +
            '<tbody>' +
            rows +
            '</tbody></table></div></details>'
        );
    }

    function heatmapCellFontSize(nLabels) {
        if (nLabels <= 4) return 13;
        if (nLabels <= 7) return 12;
        return 11;
    }

    function initDesc14PairPresets() {
        const mount = document.getElementById('desc14PairPresets');
        if (!mount || !schema) return;
        const pairs = schema.presets?.scatter_pairs || [];
        let firstAvailable = null;
        pairs.forEach(function (p) {
            if (p.available && !firstAvailable) firstAvailable = p.id;
        });
        let html = '';
        pairs.forEach(function (p) {
            const checked = p.id === firstAvailable ? ' checked' : '';
            const disabled = p.available ? '' : ' disabled';
            const cls = p.available ? '' : ' analysis-corr-pair-unavailable';
            const cols =
                p.available && p.x_col && p.y_col
                    ? ' <span class="analysis-corr-pair-cols">(' +
                      App().escapeHtml(p.x_col) +
                      ' · ' +
                      App().escapeHtml(p.y_col) +
                      ')</span>'
                    : ' <span class="analysis-corr-pair-cols">(no disponible en el dataset)</span>';
            html +=
                '<label class="analysis-corr-preset' +
                cls +
                '">' +
                '<input type="radio" name="desc14Pair" value="' +
                App().escapeHtml(p.id) +
                '"' +
                checked +
                disabled +
                ' />' +
                '<span>' +
                p.num +
                '. ' +
                App().escapeHtml(p.x_label) +
                ' × ' +
                App().escapeHtml(p.y_label) +
                cols +
                '</span>' +
                '</label>';
        });
        mount.innerHTML = html || '<p class="analysis-preview-note">No hay pares configurados.</p>';
        mount.querySelectorAll('input[name="desc14Pair"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (!radio.disabled) runDesc14Pair();
            });
        });
        if (firstAvailable) runDesc14Pair();
    }

    function plotScatterLoess(containerId, data) {
        if (!window.Plotly || !data) return;
        const byGroup = {};
        (data.points || []).forEach(function (p) {
            if (!byGroup[p.group]) byGroup[p.group] = { x: [], y: [] };
            byGroup[p.group].x.push(p.x);
            byGroup[p.group].y.push(p.y);
        });
        const traces = [];
        const groupNames =
            data.groups && data.groups.length ? data.groups : Object.keys(byGroup).sort();
        groupNames.forEach(function (g, i) {
            if (!byGroup[g]) return;
            traces.push({
                type: 'scatter',
                mode: 'markers',
                name: String(g),
                x: byGroup[g].x,
                y: byGroup[g].y,
                marker: {
                    color: PLOTLY_PALETTE[i % PLOTLY_PALETTE.length],
                    size: 10,
                    opacity: 0.82,
                    line: { width: 0.6, color: '#ffffff' }
                },
                hovertemplate:
                    (data.x_col || 'X') +
                    ': %{x}<br>' +
                    (data.y_col || 'Y') +
                    ': %{y}<extra>' +
                    g +
                    '</extra>'
            });
        });
        if (data.linear_fit && data.linear_fit.x && data.linear_fit.x.length) {
            let linName = 'Regresión lineal';
            if (data.linear_fit.r_squared != null) {
                linName += ' (R²=' + data.linear_fit.r_squared + ')';
            }
            traces.push({
                type: 'scatter',
                mode: 'lines',
                name: linName,
                x: data.linear_fit.x,
                y: data.linear_fit.y,
                line: { color: '#dc2626', width: 2, dash: 'dash' },
                hoverinfo: 'skip'
            });
        }
        if (data.loess && data.loess.x && data.loess.x.length) {
            traces.push({
                type: 'scatter',
                mode: 'lines',
                name: 'Tendencia LOESS',
                x: data.loess.x,
                y: data.loess.y,
                line: { color: '#0f172a', width: 2.5 },
                hoverinfo: 'skip'
            });
        }
        const title =
            (data.x_label || data.x_col || 'X') + ' vs ' + (data.y_label || data.y_col || 'Y');
        Plotly.newPlot(
            containerId,
            traces,
            {
                margin: { t: 56, b: 60, l: 58, r: 28 },
                title: plotTitle(title),
                xaxis: { title: data.x_col || data.x_label },
                yaxis: { title: data.y_col || data.y_label },
                showlegend: true,
                legend: { orientation: 'h', y: 1.12, x: 0, font: { size: 11 } }
            },
            plotlyConfig()
        );
    }

    function renderScatterCorrelationResult(mount, data) {
        if (!mount) return;
        const sId = plotId('desc14scatter');
        const corr = data.correlation || {};
        const sp = data.spearman || {};
        const pear = data.pearson || {};
        let stats =
            '<p class="analysis-corr-scatter-stats"><strong>Coeficiente de la matriz (' +
            App().escapeHtml(corr.method ? corrMethodLabel(corr.method) : '—') +
            ') = ' +
            App().escapeHtml(corr.r != null ? String(corr.r) : '—') +
            '</strong>';
        if (corr.p_value != null) stats += ' · p = ' + App().escapeHtml(String(corr.p_value));
        if (corr.n != null) stats += ' · n = ' + App().escapeHtml(String(corr.n));
        stats +=
            '<br>Spearman ρ = ' +
            App().escapeHtml(sp.rho != null ? String(sp.rho) : '—') +
            (sp.p_value != null ? ' · p = ' + App().escapeHtml(String(sp.p_value)) : '');
        stats +=
            ' · Pearson r = ' +
            App().escapeHtml(pear.r != null ? String(pear.r) : '—') +
            (pear.p_value != null ? ' · p = ' + App().escapeHtml(String(pear.p_value)) : '');
        stats += '</p>';
        if (data.justification) {
            stats += '<p class="analysis-preview-note">' + App().escapeHtml(data.justification) + '</p>';
        }
        mount.innerHTML =
            stats + '<div id="' + sId + '" class="analysis-chart analysis-chart-scatter"></div>';
        plotScatterLoess(sId, data);
    }

    function initDesc14CustomScatterSelectors() {
        const num = schema?.numeric_columns || [];
        const xSel = document.getElementById('desc14ScatterX');
        const ySel = document.getElementById('desc14ScatterY');
        if (!xSel || !ySel || !num.length) return;
        fillSelect(xSel, num);
        fillSelect(ySel, num);
        if (num.length > 0) xSel.value = num[0];
        if (num.length > 1) ySel.value = num[1];
    }

    async function runDesc14Pair() {
        const radio = document.querySelector('input[name="desc14Pair"]:checked');
        const mount = document.getElementById('desc14PairResults');
        if (!radio || radio.disabled || !mount) return;
        App().showLoading('Generando gráfico de dispersión...');
        try {
            const data = await postJson('/descriptivo/scatter-correlation', { pair_id: radio.value });
            renderScatterCorrelationResult(mount, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    async function runDesc14CustomScatter() {
        const xCol = document.getElementById('desc14ScatterX')?.value;
        const yCol = document.getElementById('desc14ScatterY')?.value;
        const mount = document.getElementById('desc14CustomScatterResults');
        if (!xCol || !yCol) {
            App().showToast('Seleccione las variables X e Y.', 'info');
            return;
        }
        if (xCol === yCol) {
            App().showToast('Elija dos variables distintas.', 'info');
            return;
        }
        App().showLoading('Generando diagrama de dispersión...');
        try {
            const data = await postJson('/descriptivo/scatter-correlation', { x: xCol, y: yCol });
            renderScatterCorrelationResult(mount, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    function renderCorrMethodNote(payload) {
        if (!payload || payload.error) return '';
        const method = payload.method_label || corrMethodLabel(payload.method || 'spearman');
        const reason = payload.method_reason || '';
        let detail = reason;
        if (payload.normal_count != null && payload.variable_count != null) {
            detail += ' Variables con normalidad: ' + payload.normal_count + '/' + payload.variable_count + '.';
        }
        if (payload.method === 'per_pair' && payload.pearson_pair_count != null) {
            detail +=
                ' Pares: ' +
                payload.pearson_pair_count +
                ' Pearson · ' +
                payload.spearman_pair_count +
                ' Spearman.';
        }
        const nInTitle = heatmapSampleTitle(payload);
        if (nInTitle) {
            detail += ' Tamaño muestral en el título del gráfico (' + nInTitle + ').';
        }
        if (payload.n_listwise != null && payload.n_pair_min !== payload.n_listwise) {
            detail += ' Casos completos en todas las variables: n=' + payload.n_listwise + '.';
        }
        let html =
            '<p class="analysis-corr-method-note"><strong>Método aplicado en la matriz: ' +
            App().escapeHtml(method) +
            '</strong> — ' +
            App().escapeHtml(detail) +
            '</p>';
        if (payload.method === 'per_pair') {
            html +=
                '<p class="analysis-corr-method-legend">En el heatmap, <strong>P</strong> = Pearson (r), <strong>S</strong> = Spearman (ρ) en ese par.</p>';
        } else if (payload.method === 'pearson') {
            html += '<p class="analysis-corr-method-legend">Todas las celdas usan el coeficiente <strong>r de Pearson</strong>.</p>';
        } else if (payload.method === 'spearman') {
            html += '<p class="analysis-corr-method-legend">Todas las celdas usan <strong>ρ de Spearman</strong>.</p>';
        }
        if (payload.recommendation) {
            html +=
                '<p class="analysis-corr-recommendation"><strong>¿Pearson o Spearman?</strong> ' +
                App().escapeHtml(payload.recommendation) +
                '</p>';
        }
        html += renderNormalityTable(payload.normality);
        return html;
    }

    function heatmapSampleTitle(payload) {
        if (!payload) return '';
        const min = payload.n_pair_min;
        const max = payload.n_pair_max;
        if (min != null && max != null) {
            if (min === max) return 'n=' + min;
            return 'n=' + min + '–' + max;
        }
        if (payload.n_listwise != null) return 'n=' + payload.n_listwise;
        if (payload.n != null) return 'n=' + payload.n;
        return '';
    }

    function heatmapMargins(labels) {
        const lens = (labels || []).map(function (l) {
            return String(l).length;
        });
        const maxLen = lens.length ? Math.max.apply(null, lens) : 10;
        const k = labels.length;
        return {
            t: 36,
            b: Math.min(120, 32 + maxLen * 3.2 + (k > 6 ? 12 : 0)),
            l: Math.min(130, 48 + maxLen * 3.5),
            r: 32,
            pad: 2
        };
    }

    function plotHeatmap(containerId, payload, options) {
        if (!window.Plotly || !payload || payload.error) return;
        options = options || {};
        const labels = payload.labels || [];
        const k = labels.length;
        const methMat = payload.method_matrix;
        const showMethodTag =
            payload.method === 'per_pair' || (methMat && methMat.some(function (row) {
                return row && row.some(function (m) {
                    return m === 'pearson' || m === 'spearman';
                });
            }));
        const cellFont = heatmapCellFontSize(k);
        const text = payload.matrix.map(function (row, i) {
            return row.map(function (v, j) {
                if (i === j) return v != null ? String(v) : '1';
                const p = payload.p_matrix[i][j];
                const star = payload.significant[i][j] ? '*' : '';
                const tag =
                    showMethodTag && methMat && methMat[i] && methMat[i][j]
                        ? corrMethodTag(methMat[i][j]) + ' '
                        : '';
                let cell = tag + (v != null ? String(v) + star : '—');
                if (p != null) cell += '\np=' + p;
                return cell;
            });
        });
        const nPart = heatmapSampleTitle(payload);
        const titleText =
            options.title ||
            'Correlación ' +
                corrMethodLabel(payload.method) +
                (nPart ? ' · ' + nPart : '');
        const plotHeight = Math.max(380, k * 72);
        Plotly.newPlot(
            containerId,
            [
                {
                    z: payload.matrix,
                    x: labels,
                    y: labels,
                    text: text,
                    texttemplate: '%{text}',
                    textfont: { size: cellFont, color: '#0f172a' },
                    type: 'heatmap',
                    colorscale: 'RdBu',
                    zmid: 0,
                    colorbar: { len: 0.92, thickness: 14, tickfont: { size: 10 } }
                }
            ],
            {
                margin: heatmapMargins(labels),
                title: plotTitle(titleText),
                autosize: true,
                height: plotHeight,
                xaxis: {
                    tickangle: k > 5 ? -35 : -25,
                    automargin: true,
                    tickfont: { size: 11 }
                },
                yaxis: {
                    automargin: true,
                    tickfont: { size: 11 }
                }
            },
            plotlyConfig({ responsive: true })
        ).then(function (gd) {
            const el = document.getElementById(containerId);
            const wrap = el && el.closest ? el.closest('.analysis-chart, .analysis-chart-wide') : null;
            if (!wrap || !window.Plotly) return;
            const w = Math.floor(wrap.getBoundingClientRect().width);
            if (w < 40) return;
            return window.Plotly.relayout(gd, { autosize: true, width: w, height: plotHeight }).then(function () {
                if (window.Plotly.Plots && window.Plotly.Plots.resize) {
                    window.Plotly.Plots.resize(gd);
                }
            });
        });
    }

    function countCrosstabCategories(crosstab) {
        const set = new Set();
        (crosstab?.groups || []).forEach(function (g) {
            (g.cells || []).forEach(function (c) {
                set.add(c.category);
            });
        });
        return set.size;
    }

    function pickHighlightCategory(categories, colName) {
        const norm = (categories || []).map(function (c) {
            return { raw: c, n: String(c).trim().toLowerCase() };
        });
        const prefer = ['sí', 'si', 'yes', '1', 'true', 'positivo', 'presente', 'cesárea', 'cesarea'];
        let hit = null;
        prefer.forEach(function (p) {
            if (hit) return;
            hit = norm.find(function (x) {
                return x.n === p || x.n.indexOf(p) >= 0;
            });
        });
        if (hit) return hit.raw;
        const col = String(colName || '').toLowerCase();
        if (col.indexOf('parto') >= 0) {
            hit = norm.find(function (x) {
                return x.n.indexOf('ces') >= 0;
            });
            if (hit) return hit.raw;
        }
        if (col.indexOf('lactancia') >= 0) {
            hit = norm.find(function (x) {
                return x.n.indexOf('exclus') >= 0 || x.n === 'sí' || x.n === 'si';
            });
            if (hit) return hit.raw;
        }
        const noLike = ['no', '0', 'false', 'ausente', 'negativo'];
        if (norm.length === 2) {
            hit = norm.find(function (x) {
                return noLike.indexOf(x.n) === -1;
            });
            if (hit) return hit.raw;
        }
        return norm[0] ? norm[0].raw : null;
    }

    function plotPrevalenceBar(containerId, crosstab, colName, groupBy) {
        if (!window.Plotly || !crosstab?.groups) return;
        const highlight = pickHighlightCategory(
            (crosstab.groups[0]?.cells || []).map(function (c) {
                return c.category;
            }),
            colName
        );
        const allCats = [];
        crosstab.groups.forEach(function (g) {
            g.cells.forEach(function (c) {
                if (allCats.indexOf(c.category) === -1) allCats.push(c.category);
            });
        });
        const target = highlight || pickHighlightCategory(allCats, colName);
        const x = [];
        const y = [];
        const text = [];
        crosstab.groups.forEach(function (g) {
            const cell = g.cells.find(function (c) {
                return c.category === target;
            });
            const pct = cell ? cell.row_percent : 0;
            const n = cell ? cell.count : 0;
            x.push(g.group);
            y.push(pct);
            text.push(n + ' caso' + (n === 1 ? '' : 's'));
        });
        Plotly.newPlot(
            containerId,
            [
                {
                    type: 'bar',
                    x: x,
                    y: y,
                    text: text,
                    textposition: 'outside',
                    marker: { color: '#2563eb', opacity: 0.88 },
                    hovertemplate:
                        groupBy +
                        ': %{x}<br>' +
                        (target || colName) +
                        ': %{y:.1f}%<br>n=%{text}<extra></extra>'
                }
            ],
            {
                margin: { t: 56, b: 72, l: 52, r: 24 },
                title: plotTitle('Prevalencia de «' + (target || colName) + '» por ' + groupBy),
                xaxis: { title: groupBy, tickangle: x.length > 4 ? -25 : 0 },
                yaxis: { title: '% dentro del grupo', range: [0, Math.min(100, Math.max(15, Math.max.apply(null, y) * 1.2))] }
            },
            plotlyConfig()
        );
    }

    function plotStackedBar(containerId, crosstab, titleText) {
        if (!window.Plotly || !crosstab?.groups) return;
        const colVar = crosstab.column_variable || 'Variable';
        const groupVar = crosstab.group_variable || 'Grupo';
        const categories = [];
        crosstab.groups.forEach(function (g) {
            g.cells.forEach(function (c) {
                if (categories.indexOf(c.category) === -1) categories.push(c.category);
            });
        });
        const traces = categories.map(function (cat, i) {
            return {
                type: 'bar',
                name: String(cat),
                marker: { color: PLOTLY_PALETTE[i % PLOTLY_PALETTE.length] },
                x: crosstab.groups.map(function (g) {
                    return g.group;
                }),
                y: crosstab.groups.map(function (g) {
                    const cell = g.cells.find(function (c) {
                        return c.category === cat;
                    });
                    return cell ? cell.row_percent : 0;
                }),
                hovertemplate:
                    groupVar +
                    ': %{x}<br>' +
                    colVar +
                    ': %{fullData.name}<br>%{y:.1f}%<extra></extra>'
            };
        });
        const layout = {
            barmode: 'stack',
            margin: { t: titleText ? 56 : 24, b: 60, l: 56, r: 20 },
            showlegend: categories.length <= 8,
            xaxis: { title: groupVar, tickangle: crosstab.groups.length > 4 ? -25 : 0 },
            yaxis: {
                title: '% dentro de cada ' + groupVar,
                range: [0, 100]
            },
            legend: { title: { text: colVar } }
        };
        if (titleText) {
            layout.title = plotTitle(titleText);
        }
        Plotly.newPlot(containerId, traces, layout, plotlyConfig());
    }

    function initDesc13Tabs() {
        document.querySelectorAll('.analysis-desc13-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                if (tab.disabled) return;
                const id = tab.getAttribute('data-desc13-tab');
                document.querySelectorAll('.analysis-desc13-tab').forEach(function (t) {
                    const on = t === tab;
                    t.classList.toggle('active', on);
                    t.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                document.querySelectorAll('.analysis-desc13-panel').forEach(function (panel) {
                    const on = panel.getAttribute('data-desc13-tab') === id;
                    panel.classList.toggle('active', on);
                    panel.hidden = !on;
                });
                if (id === 'alluvial' && getSelectedAlluvialStages().length >= 2) {
                    scheduleAlluvialUpdate();
                }
            });
        });
    }

    function initDesc13PcpSelectors() {
        const sel = document.getElementById('desc13PcpOutcome');
        if (!sel || !schema) return;
        const outcomes = schema.presets?.pcp?.outcomes || [];
        const preferred = outcomes.find(function (c) {
            return /triglicerid/i.test(c);
        });
        fillSelect(sel, outcomes, preferred || outcomes[0]);
    }

    function initDesc13HeatmapSort() {
        const sel = document.getElementById('desc13HeatmapSort');
        if (!sel || !schema) return;
        const cols = schema.presets?.adversity_heatmap?.sort_columns || schema.presets?.pcp?.outcomes || [];
        const preferred = cols.find(function (c) {
            return /triglicerid/i.test(c);
        });
        fillSelect(sel, cols, preferred || cols[0]);
    }

    function initDesc13RadarCompare() {
        const sel = document.getElementById('desc13RadarCompare');
        if (!sel || !schema) return;
        const presets = schema.presets?.radar_compare?.presets || [];
        sel.innerHTML =
            '<option value="">— Seleccione —</option>' +
            presets
                .map(function (p) {
                    return (
                        '<option value="' +
                        App().escapeHtml(p.id) +
                        '">' +
                        App().escapeHtml(p.title || p.id) +
                        '</option>'
                    );
                })
                .join('');
        const preferred = presets.find(function (p) {
            return p.id === 'sm_m';
        });
        if (preferred) sel.value = preferred.id;
    }

    function radarCompareExpander(summaryHtml, bodyHtml, open) {
        return (
            '<details class="analysis-expander analysis-radar-expander"' +
            (open ? ' open' : '') +
            '>' +
            '<summary>' +
            summaryHtml +
            '</summary>' +
            '<div class="analysis-expander-body">' +
            bodyHtml +
            '</div></details>'
        );
    }

    function buildRadarCompareLegendContent(data) {
        const interp = data.interpretation || {};
        let html =
            '<div class="analysis-radar-legend">' +
            '<ul class="analysis-radar-legend-series">' +
            '<li><span class="analysis-radar-swatch analysis-radar-swatch-ref"></span> ' +
            App().escapeHtml(interp.series_reference || 'Azul: grupo de referencia.') +
            '</li>' +
            '<li><span class="analysis-radar-swatch analysis-radar-swatch-adv"></span> ' +
            App().escapeHtml(interp.series_adverse || 'Rojo: grupo con evento adverso.') +
            '</li>' +
            '</ul>';
        if (interp.intro) {
            html += '<p>' + App().escapeHtml(interp.intro) + '</p>';
        }
        if (interp.radial) {
            html += '<p><strong>Radio (distancia al centro):</strong> ' + App().escapeHtml(interp.radial) + '</p>';
        }
        if (interp.angular) {
            html += '<p><strong>Ejes alrededor del círculo (θ):</strong> ' + App().escapeHtml(interp.angular) + '</p>';
        }
        if (data.axes && data.axes.length) {
            html += '<dl class="analysis-radar-legend-axes">';
            data.axes.forEach(function (ax) {
                html +=
                    '<dt>' +
                    App().escapeHtml(ax.label || ax.id) +
                    '</dt><dd>' +
                    App().escapeHtml(ax.description || '') +
                    '</dd>';
            });
            html += '</dl>';
        }
        if (interp.tooltip_note) {
            html +=
                '<p class="analysis-preview-note">' + App().escapeHtml(interp.tooltip_note) + '</p>';
        }
        if (data.n_complete != null) {
            html +=
                '<p class="analysis-preview-note">Cohorte con datos completos en los 5 ejes: n=' +
                data.n_complete +
                ' · ' +
                App().escapeHtml(data.standardization || '') +
                '</p>';
        }
        html += '</div>';
        return html;
    }

    function buildRadarCompareLegendHtml(data) {
        return radarCompareExpander(
            '<i class="fas fa-circle-info" aria-hidden="true"></i> Guía del radar comparativo',
            buildRadarCompareLegendContent(data),
            false
        );
    }

    function buildRadarCompareNarrativeContent(data) {
        const narr = data.result_narrative;
        if (!narr || !narr.by_series || !narr.by_series.length) return '';
        let html = '<div class="analysis-radar-narrative">';
        narr.by_series.forEach(function (grp) {
            const swatch = grp.adverse
                ? 'analysis-radar-swatch-adv'
                : 'analysis-radar-swatch-ref';
            html +=
                '<div class="analysis-radar-narrative-group">' +
                '<p class="analysis-radar-narrative-heading">' +
                '<span class="analysis-radar-swatch ' +
                swatch +
                '"></span> ' +
                '<strong>' +
                App().escapeHtml(grp.color_label || (grp.adverse ? 'Rojo' : 'Azul')) +
                '</strong> — ' +
                App().escapeHtml(grp.name || '') +
                (grp.n != null ? ' (n=' + grp.n + ')' : '') +
                '</p><ul>';
            (grp.bullets || []).forEach(function (b) {
                html += '<li>' + App().escapeHtml(b.sentence || '') + '</li>';
            });
            html += '</ul></div>';
        });
        if (narr.contrasts && narr.contrasts.length) {
            html += '<div class="analysis-radar-narrative-contrasts"><p><strong>Comparación entre polígonos</strong></p><ul>';
            narr.contrasts.forEach(function (c) {
                html += '<li>' + App().escapeHtml(c.sentence || '') + '</li>';
            });
            html += '</ul></div>';
        }
        if (narr.causal_note) {
            html +=
                '<p class="analysis-preview-note">' + App().escapeHtml(narr.causal_note) + '</p>';
        }
        html += '</div>';
        return html;
    }

    function buildRadarCompareNarrativeHtml(data) {
        const body = buildRadarCompareNarrativeContent(data);
        if (!body) return '';
        const title =
            (data.result_narrative && data.result_narrative.title) ||
            'Interpretación según este gráfico';
        const cmp = data.comparison_title ? ' · ' + data.comparison_title : '';
        return radarCompareExpander(
            '<i class="fas fa-align-left" aria-hidden="true"></i> ' +
                App().escapeHtml(title) +
                App().escapeHtml(cmp),
            body,
            false
        );
    }

    function plotRadarCompare(containerId, data) {
        if (!window.Plotly || !data?.series?.length || !data?.axes?.length) return;
        const axesByLabel = {};
        data.axes.forEach(function (a) {
            axesByLabel[a.label] = a;
        });
        const theta = data.axes.map(function (a) {
            return a.label;
        });
        const thetaClosed = theta.concat([theta[0]]);
        const traces = data.series.map(function (s) {
            const vals = (s.values || []).map(function (v) {
                return v == null ? 0 : Number(v);
            });
            const r = vals.concat([vals[0]]);
            const hovertext = theta.map(function (label, i) {
                const ax = axesByLabel[label] || {};
                const v = vals[i];
                const zStr =
                    v == null || (typeof v === 'number' && isNaN(v)) ? '—' : Number(v).toFixed(2);
                let h =
                    '<b>' +
                    App().escapeHtml(s.name) +
                    '</b><br>' +
                    App().escapeHtml(label) +
                    ': <b>z = ' +
                    zStr +
                    '</b> (media del grupo)';
                if (ax.description) {
                    h +=
                        '<br><span style="font-size:11px;color:#e2e8f0">' +
                        App().escapeHtml(ax.description) +
                        '</span>';
                }
                return h;
            });
            hovertext.push(hovertext[0]);
            const adverse = s.adverse === true;
            const color = adverse ? '#dc2626' : '#2563eb';
            const fill = adverse ? 'rgba(220,38,38,0.18)' : 'rgba(37,99,235,0.14)';
            return {
                type: 'scatterpolar',
                r: r,
                theta: thetaClosed,
                text: hovertext,
                hovertemplate: '%{text}<extra></extra>',
                name: s.name + ' (n=' + s.n + ')',
                fill: 'toself',
                fillcolor: fill,
                line: { color: color, width: 2 },
                marker: { size: 4, color: color },
                hoverlabel: {
                    bgcolor: '#1e293b',
                    bordercolor: '#334155',
                    font: { family: 'Segoe UI, system-ui, sans-serif', size: 12, color: '#f8fafc' },
                    align: 'left'
                }
            };
        });
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: {
                    text: data.comparison_title || 'Radar comparativo',
                    font: { size: 14, color: '#0f172a' },
                    x: 0.5,
                    xanchor: 'center'
                },
                polar: {
                    bgcolor: '#ffffff',
                    radialaxis: {
                        visible: true,
                        title: { text: 'Media z (cohorte)', font: { size: 11, color: '#64748b' } },
                        gridcolor: '#e2e8f0',
                        linecolor: '#cbd5e1',
                        tickfont: { size: 10, color: '#64748b' }
                    },
                    angularaxis: {
                        gridcolor: '#e2e8f0',
                        linecolor: '#cbd5e1',
                        tickfont: { size: 11, color: '#1e293b' }
                    }
                },
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#ffffff',
                font: { family: 'Segoe UI, system-ui, sans-serif', color: '#0f172a', size: 12 },
                legend: { orientation: 'h', y: -0.12, x: 0.5, xanchor: 'center' },
                margin: { t: 56, r: 48, b: 72, l: 48 },
                height: 480
            },
            plotlyConfig()
        );
    }

    function initDesc13DensitySelectors() {
        const stratSel = document.getElementById('desc13DensityStratify');
        const varSel = document.getElementById('desc13DensityVariable');
        if (!schema) return;
        const cd = schema.presets?.conditional_density || {};
        if (stratSel) {
            const presets = cd.stratify || [];
            stratSel.innerHTML =
                '<option value="">— Seleccione —</option>' +
                presets
                    .map(function (p) {
                        return (
                            '<option value="' +
                            App().escapeHtml(p.id) +
                            '">' +
                            App().escapeHtml(p.title || p.id) +
                            '</option>'
                        );
                    })
                    .join('');
            if (cd.default_stratify) stratSel.value = cd.default_stratify;
        }
        if (varSel) {
            const cols = cd.child_variables || [];
            const preferred = cd.default_variable || cols.find(function (c) {
                return /triglicerid/i.test(c);
            });
            fillSelect(varSel, cols, preferred || cols[0]);
        }
    }

    function plotConditionalDensity(containerId, data) {
        if (!window.Plotly || !data?.groups?.length) return;
        const traces = (data.groups || []).map(function (g) {
            const adverse = g.adverse === true;
            const color = adverse ? '#dc2626' : '#2563eb';
            const fill = adverse ? 'rgba(220, 38, 38, 0.2)' : 'rgba(37, 99, 235, 0.16)';
            return {
                type: 'scatter',
                mode: 'lines',
                x: g.x || [],
                y: g.density || [],
                name: g.name + ' (n=' + g.n + ')',
                line: { color: color, width: 2.5, shape: 'spline' },
                fill: 'tozeroy',
                fillcolor: fill,
                hovertemplate:
                    '<b>' +
                    App().escapeHtml(g.name) +
                    '</b><br>%{x}<br>Densidad: %{y:.3f}<extra></extra>'
            };
        });
        const title =
            'Densidad de ' +
            (data.value_label || data.value_column || '') +
            ' · ' +
            (data.stratify_label || data.stratify_column || '');
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: {
                    text: title,
                    font: { size: 14, color: '#0f172a' },
                    x: 0.5,
                    xanchor: 'center'
                },
                xaxis: {
                    title: data.value_label || data.value_column || '',
                    gridcolor: '#f1f5f9',
                    zeroline: false
                },
                yaxis: {
                    title: 'Densidad (escala relativa)',
                    gridcolor: '#f1f5f9',
                    rangemode: 'tozero',
                    zeroline: false
                },
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#ffffff',
                font: { family: 'Segoe UI, system-ui, sans-serif', color: '#0f172a', size: 12 },
                legend: { orientation: 'h', y: -0.18, x: 0.5, xanchor: 'center' },
                margin: { t: 64, r: 40, b: 72, l: 56 },
                height: 440,
                hovermode: 'x unified'
            },
            plotlyConfig()
        );
    }

    async function runDesc13Density() {
        const stratify = document.getElementById('desc13DensityStratify')?.value;
        const variable = document.getElementById('desc13DensityVariable')?.value;
        const mount = document.getElementById('desc13DensityResults');
        if (!stratify || !variable || !mount) {
            App().showToast('Seleccione estratificación y variable del niño', 'info');
            return;
        }
        App().showLoading('Generando densidad condicional...');
        try {
            const data = await postJson('/descriptivo/conditional-density', {
                stratify_by: stratify,
                variable: variable
            });
            const cId = plotId('desc13density');
            mount.innerHTML = '<div id="' + cId + '" class="analysis-chart analysis-chart-density"></div>';
            plotConditionalDensity(cId, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    function initDesc13ScatterStratify() {
        const sel = document.getElementById('desc13ScatterStratify');
        if (!sel || !schema) return;
        const sm = schema.presets?.scatter_matrix || {};
        const presets = sm.stratify || [];
        sel.innerHTML =
            '<option value="">— Seleccione —</option>' +
            presets
                .map(function (p) {
                    return (
                        '<option value="' +
                        App().escapeHtml(p.id) +
                        '">' +
                        App().escapeHtml(p.title || p.id) +
                        '</option>'
                    );
                })
                .join('');
        if (sm.default_stratify) sel.value = sm.default_stratify;
    }

    function scatterMatrixAxisIndex(row, col, n) {
        return row * n + col + 1;
    }

    function scatterMatrixAxisKeys(idx) {
        return {
            xKey: idx === 1 ? 'xaxis' : 'xaxis' + idx,
            yKey: idx === 1 ? 'yaxis' : 'yaxis' + idx,
            xAnchor: idx === 1 ? 'y' : 'y' + idx,
            yAnchor: idx === 1 ? 'x' : 'x' + idx
        };
    }

    function scatterMatrixAxisRef(idx, prefix) {
        return idx === 1 ? prefix : prefix + idx;
    }

    function scatterMatrixApplyRange(axisCfg, rng) {
        if (!rng || rng.min == null || rng.max == null) return;
        axisCfg.autorange = false;
        axisCfg.fixedrange = true;
        axisCfg.range = [Number(rng.min), Number(rng.max)];
    }

    function scatterMatrixYTickColumn(row) {
        return row === 0 ? 1 : 0;
    }

    function scatterMatrixShowYTicks(row, col) {
        if (row === col) return false;
        return col === scatterMatrixYTickColumn(row);
    }

    function scatterMatrixMasterYIdx(row, n) {
        const col = scatterMatrixYTickColumn(row);
        if (row === col) return null;
        return scatterMatrixAxisIndex(row, col, n);
    }

    function plotConditionalScatterMatrix(containerId, data) {
        if (!window.Plotly || !data?.cells?.length || !data?.variables?.length) return;
        const vars = data.variables;
        const n = vars.length;
        const labels = vars.map(function (v) {
            return v.label || v.column;
        });
        const upperColor = data.upper?.adverse ? '#dc2626' : '#2563eb';
        const lowerColor = data.lower?.adverse ? '#dc2626' : '#2563eb';
        const gap = 0.02;
        const cellSize = (1 - gap * (n - 1)) / n;
        const traces = [];
        const layout = {
            showlegend: false,
            barmode: 'overlay',
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: { family: 'Segoe UI, system-ui, sans-serif', color: '#0f172a', size: 10 },
            margin: { t: 132, r: 16, b: 36, l: 72 },
            annotations: []
        };
        const axisRanges = data.axis_ranges || {};
        const colMasterX = [];
        const rowMasterY = [];
        for (let c = 0; c < n; c++) {
            colMasterX[c] = scatterMatrixAxisIndex(0, c, n);
        }
        for (let r = 0; r < n; r++) {
            rowMasterY[r] = scatterMatrixMasterYIdx(r, n);
        }
        const cellMap = {};
        (data.cells || []).forEach(function (c) {
            cellMap[c.row + '-' + c.col] = c;
        });
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const idx = scatterMatrixAxisIndex(row, col, n);
                const keys = scatterMatrixAxisKeys(idx);
                const x0 = col * (cellSize + gap);
                const y0 = 1 - (row + 1) * (cellSize + gap) + gap;
                const xVarId = vars[col].id;
                const yVarId = vars[row].id;
                const xR = axisRanges[xVarId];
                const yR = axisRanges[yVarId];
                const isDiagonal = row === col;
                const isXMaster = idx === colMasterX[col];
                const yMasterIdx = rowMasterY[row];
                const isYMaster = yMasterIdx !== null && idx === yMasterIdx;
                const showYTicks = scatterMatrixShowYTicks(row, col);
                const xCfg = {
                    domain: [x0, x0 + cellSize],
                    anchor: keys.yAnchor,
                    showgrid: true,
                    gridcolor: '#f1f5f9',
                    zeroline: false,
                    side: row === 0 ? 'top' : 'bottom',
                    showticklabels: row === 0 && isXMaster,
                    ticks: row === 0 && isXMaster ? 'outside' : '',
                    ticklen: row === 0 && isXMaster ? 4 : 0,
                    tickfont: { size: 9 },
                    title: undefined
                };
                if (xR) {
                    if (isXMaster) {
                        scatterMatrixApplyRange(xCfg, xR);
                    } else {
                        xCfg.matches = scatterMatrixAxisRef(colMasterX[col], 'x');
                        xCfg.showticklabels = false;
                    }
                } else {
                    xCfg.autorange = true;
                }
                layout[keys.xKey] = xCfg;
                const yCfg = {
                    domain: [y0, y0 + cellSize],
                    anchor: keys.xAnchor,
                    showgrid: true,
                    gridcolor: '#f1f5f9',
                    zeroline: false,
                    side: 'left',
                    showticklabels: showYTicks,
                    ticks: showYTicks ? 'outside' : '',
                    ticklen: showYTicks ? 4 : 0,
                    tickfont: { size: 9 },
                    title: undefined
                };
                if (isDiagonal) {
                    yCfg.autorange = true;
                } else if (yR) {
                    if (isYMaster) {
                        scatterMatrixApplyRange(yCfg, yR);
                    } else if (yMasterIdx !== null) {
                        yCfg.matches = scatterMatrixAxisRef(yMasterIdx, 'y');
                    }
                } else {
                    yCfg.autorange = true;
                }
                layout[keys.yKey] = yCfg;
                const panel = cellMap[row + '-' + col];
                if (!panel) continue;
                const xRef = keys.xKey === 'xaxis' ? 'x' : 'x' + idx;
                const yRef = keys.yKey === 'yaxis' ? 'y' : 'y' + idx;
                if (panel.kind === 'diagonal') {
                    traces.push({
                        type: 'histogram',
                        x: panel.upper_values || [],
                        marker: { color: upperColor, opacity: 0.55 },
                        xaxis: xRef,
                        yaxis: yRef,
                        hovertemplate: '%{x}<extra>' + (data.upper?.label || '') + '</extra>',
                        showlegend: false
                    });
                    traces.push({
                        type: 'histogram',
                        x: panel.lower_values || [],
                        marker: { color: lowerColor, opacity: 0.45 },
                        xaxis: xRef,
                        yaxis: yRef,
                        hovertemplate: '%{x}<extra>' + (data.lower?.label || '') + '</extra>',
                        showlegend: false
                    });
                    continue;
                }
                const pts = panel.points || [];
                const color = panel.triangle === 'upper' ? upperColor : lowerColor;
                traces.push({
                    type: 'scatter',
                    mode: 'markers',
                    x: pts.map(function (p) {
                        return p.x;
                    }),
                    y: pts.map(function (p) {
                        return p.y;
                    }),
                    marker: { color: color, size: 6, opacity: 0.78, line: { width: 0.4, color: '#fff' } },
                    xaxis: xRef,
                    yaxis: yRef,
                    hovertemplate:
                        labels[col] + ': %{x}<br>' + labels[row] + ': %{y}<extra></extra>',
                    showlegend: false
                });
                if (panel.loess && panel.loess.x && panel.loess.x.length) {
                    traces.push({
                        type: 'scatter',
                        mode: 'lines',
                        x: panel.loess.x,
                        y: panel.loess.y,
                        line: { color: '#0f172a', width: 2 },
                        xaxis: xRef,
                        yaxis: yRef,
                        hoverinfo: 'skip',
                        showlegend: false
                    });
                }
            }
        }
        for (let col = 0; col < n; col++) {
            const x0 = col * (cellSize + gap);
            layout.annotations.push({
                text: '<b>' + labels[col] + '</b>',
                xref: 'paper',
                yref: 'paper',
                x: x0 + cellSize / 2,
                y: 1.055,
                showarrow: false,
                xanchor: 'center',
                yanchor: 'bottom',
                font: { size: 11, color: '#334155' }
            });
        }
        for (let row = 0; row < n; row++) {
            const y0 = 1 - (row + 1) * (cellSize + gap) + gap;
            layout.annotations.push({
                text: '<b>' + labels[row] + '</b>',
                xref: 'paper',
                yref: 'paper',
                x: -0.018,
                y: y0 + cellSize / 2,
                showarrow: false,
                xanchor: 'right',
                yanchor: 'middle',
                textangle: -90,
                font: { size: 11, color: '#334155' }
            });
        }
        layout.title = {
            text:
                'Matriz de dispersión · ' +
                (data.stratify_label || data.stratify_column || '') +
                '<br><sup style="font-size:11px;color:#64748b">▲ ' +
                (data.upper?.label || '') +
                ' (n=' +
                (data.upper?.n || '') +
                ') · ▼ ' +
                (data.lower?.label || '') +
                ' (n=' +
                (data.lower?.n || '') +
                ')</sup>',
            font: { size: 14, color: '#0f172a' },
            x: 0.5,
            xanchor: 'center'
        };
        layout.height = Math.max(640, 118 * n + 100);
        Plotly.newPlot(containerId, traces, layout, plotlyConfig());
    }

    async function runDesc13Scatter() {
        const stratify = document.getElementById('desc13ScatterStratify')?.value;
        const mount = document.getElementById('desc13ScatterResults');
        if (!stratify || !mount) {
            App().showToast('Seleccione la variable de estratificación', 'info');
            return;
        }
        App().showLoading('Generando matriz de dispersión...');
        try {
            const data = await postJson('/descriptivo/scatter-matrix', { stratify_by: stratify });
            const cId = plotId('desc13scatter');
            mount.innerHTML =
                '<div id="' + cId + '" class="analysis-chart analysis-chart-scatter-matrix"></div>';
            plotConditionalScatterMatrix(cId, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    async function runDesc13Radar() {
        const comparison = document.getElementById('desc13RadarCompare')?.value;
        const mount = document.getElementById('desc13RadarResults');
        if (!comparison || !mount) {
            App().showToast('Seleccione la comparación de grupos', 'info');
            return;
        }
        App().showLoading('Generando radar comparativo...');
        try {
            const data = await postJson('/descriptivo/radar-compare', { comparison: comparison });
            const cId = plotId('desc13radar');
            mount.innerHTML =
                buildRadarCompareLegendHtml(data) +
                '<div id="' +
                cId +
                '" class="analysis-chart analysis-chart-radar"></div>' +
                buildRadarCompareNarrativeHtml(data);
            plotRadarCompare(cId, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    function plotPerinatalAdversityHeatmap(containerId, data) {
        if (!window.Plotly || !data?.matrix?.length) return;
        const z = data.display_matrix || data.matrix;
        const nRows = z.length;
        const sortLabel = data.sort_label || 'marcador';
        const hoverText = z.map(function (row, ri) {
            const meta = (data.row_meta && data.row_meta[ri]) || {};
            const rowAbn = meta.sort_abnormal;
            const abnLbl = meta.sort_abnormal_label || '';
            return row.map(function (cellVal, ci) {
                const col = data.column_labels[ci] || '';
                const raw =
                    data.raw_matrix && data.raw_matrix[ri] && data.raw_matrix[ri][ci] != null
                        ? data.raw_matrix[ri][ci]
                        : '';
                let estado = 'Sin evento materno adverso';
                if (cellVal === 2) {
                    estado = 'Factor materno Sí + ' + sortLabel + ' alterado';
                } else if (cellVal === 1) {
                    estado = 'Solo factor materno Sí (columna)';
                }
                let h =
                    '<b>' +
                    App().escapeHtml(String(data.row_labels[ri])) +
                    '</b><br>' +
                    App().escapeHtml(col) +
                    ': ' +
                    App().escapeHtml(String(raw)) +
                    '<br><i>' +
                    App().escapeHtml(estado) +
                    '</i>';
                if (rowAbn && abnLbl) {
                    h += '<br>' + App().escapeHtml(sortLabel) + ': ' + App().escapeHtml(abnLbl);
                } else if (rowAbn) {
                    h += '<br>' + App().escapeHtml(sortLabel) + ' fuera de rango';
                }
                return h;
            });
        });
        const rowH = Math.max(14, Math.min(22, 520 / Math.max(nRows, 1)));
        Plotly.newPlot(
            containerId,
            [
                {
                    z: z,
                    x: data.column_labels,
                    y: data.row_labels,
                    text: hoverText,
                    hovertemplate: '%{text}<extra></extra>',
                    type: 'heatmap',
                    colorscale: [
                        [0, '#ffffff'],
                        [0.49, '#fecaca'],
                        [0.51, '#f87171'],
                        [1, '#991b1b']
                    ],
                    zmin: 0,
                    zmax: 2,
                    showscale: true,
                    colorbar: {
                        title: 'Evento',
                        tickvals: [0, 1, 2],
                        ticktext: ['No', 'Materno Sí', 'Sí + marcador'],
                        len: 0.55
                    },
                    xgap: 2,
                    ygap: 1,
                    hoverlabel: {
                        bgcolor: '#1e293b',
                        bordercolor: '#334155',
                        font: { family: 'Segoe UI, system-ui, sans-serif', size: 12, color: '#f8fafc' },
                        align: 'left'
                    }
                }
            ],
            {
                margin: {
                    t: 72,
                    r: 72,
                    b: 120,
                    l: Math.min(220, 88 + nRows * 0.35)
                },
                title: {
                    text: 'Eventos perinatales adversos',
                    font: { size: 14, color: '#0f172a' },
                    x: 0.5,
                    xanchor: 'center'
                },
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#ffffff',
                font: { family: 'Segoe UI, system-ui, sans-serif', color: '#0f172a', size: 12 },
                xaxis: {
                    tickangle: -32,
                    automargin: true,
                    tickfont: { size: 11, color: '#1e293b' },
                    side: 'bottom'
                },
                yaxis: {
                    automargin: true,
                    tickfont: { size: nRows > 24 ? 9 : 10, color: '#1e293b' },
                    dtick: nRows > 30 ? 2 : 1
                },
                height: Math.max(360, 80 + nRows * rowH)
            },
            plotlyConfig()
        );
    }

    async function runDesc13Heatmap() {
        const sortCol = document.getElementById('desc13HeatmapSort')?.value;
        const mount = document.getElementById('desc13HeatmapResults');
        if (!sortCol || !mount) {
            App().showToast('Seleccione el marcador para ordenar filas', 'info');
            return;
        }
        App().showLoading('Generando heatmap de eventos adversos...');
        try {
            const data = await postJson('/descriptivo/perinatal-adversity-heatmap', { sort_by: sortCol });
            const cId = plotId('desc13heatmap');
            let legendHtml =
                '<div class="analysis-adversity-heatmap-legend">' +
                '<p><strong>Lectura del heatmap</strong> (filas ordenadas por <em>' +
                App().escapeHtml(data.sort_label || sortCol) +
                '</em>):</p><ul>' +
                '<li><span class="analysis-adv-swatch analysis-adv-swatch-none"></span> Blanco: la madre <strong>no</strong> tiene ese factor (No).</li>' +
                '<li><span class="analysis-adv-swatch analysis-adv-swatch-maternal"></span> Rojo claro: factor materno <strong>Sí</strong> (evento perinatal).</li>' +
                '<li><span class="analysis-adv-swatch analysis-adv-swatch-combined"></span> Rojo oscuro: factor materno Sí <strong>y</strong> el marcador del niño en esa fila fuera de rango clínico (evento adverso combinado).</li>' +
                '</ul>';
            if (data.sort_threshold && data.sort_threshold.label) {
                legendHtml +=
                    '<p class="analysis-preview-note">Umbral del marcador: ' +
                    App().escapeHtml(data.sort_threshold.label) +
                    (data.n_combined_adverse != null
                        ? ' · Celdas combinadas: ' + data.n_combined_adverse
                        : '') +
                    '</p>';
            }
            legendHtml += '</div>';
            mount.innerHTML =
                legendHtml +
                '<div id="' +
                cId +
                '" class="analysis-chart analysis-chart-adversity-heatmap"></div>';
            plotPerinatalAdversityHeatmap(cId, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    let desc13AlluvialTimer = null;
    let desc13AlluvialBound = false;
    let desc13AlluvialApplyingPreset = false;

    function getAlluvialEligibleColumns() {
        return (schema && schema.presets && schema.presets.alluvial && schema.presets.alluvial.columns) || [];
    }

    function buildAlluvialStageSelectOptions(selected) {
        const cols = getAlluvialEligibleColumns();
        const used = new Set(getSelectedAlluvialStages().filter(function (c) {
            return c && c !== selected;
        }));
        let html = '<option value="">— Variable —</option>';
        cols.forEach(function (c) {
            if (used.has(c) && c !== selected) return;
            const sel = c === selected ? ' selected' : '';
            html += '<option value="' + App().escapeHtml(c) + '"' + sel + '>' + App().escapeHtml(c) + '</option>';
        });
        return html;
    }

    function getSelectedAlluvialStages() {
        const list = document.getElementById('desc13AlluvialStagesList');
        if (!list) return [];
        return Array.from(list.querySelectorAll('.analysis-alluvial-stage-select'))
            .map(function (sel) {
                return sel.value;
            })
            .filter(Boolean);
    }

    function refreshAlluvialStageNumbers() {
        const list = document.getElementById('desc13AlluvialStagesList');
        if (!list) return;
        list.querySelectorAll('.analysis-alluvial-stage-row').forEach(function (row, i) {
            const num = row.querySelector('.analysis-alluvial-stage-num');
            if (num) num.textContent = String(i + 1);
            const removeBtn = row.querySelector('[data-action="remove"]');
            if (removeBtn) removeBtn.disabled = list.querySelectorAll('.analysis-alluvial-stage-row').length <= 2;
        });
        const addBtn = document.getElementById('desc13AlluvialAddStage');
        const maxStages = (schema && schema.presets && schema.presets.alluvial && schema.presets.alluvial.max_stages) || 8;
        if (addBtn) addBtn.disabled = list.querySelectorAll('.analysis-alluvial-stage-row').length >= maxStages;
    }

    function refreshAlluvialStageSelects() {
        const list = document.getElementById('desc13AlluvialStagesList');
        if (!list) return;
        list.querySelectorAll('.analysis-alluvial-stage-select').forEach(function (sel) {
            const current = sel.value;
            sel.innerHTML = buildAlluvialStageSelectOptions(current);
            sel.value = current;
        });
    }

    function getAlluvialFocusPresets() {
        return (schema && schema.presets && schema.presets.alluvial && schema.presets.alluvial.focus_presets) || [];
    }

    function getAlluvialFocusPresetById(id) {
        return getAlluvialFocusPresets().find(function (p) {
            return p.id === id;
        });
    }

    function setAlluvialFocusRadio(value) {
        const radio = document.querySelector('input[name="desc13AlluvialFocus"][value="' + value + '"]');
        if (radio) radio.checked = true;
    }

    function renderAlluvialFocusDetail(preset) {
        const detail = document.getElementById('desc13AlluvialFocusDetail');
        if (!detail) return;
        if (!preset) {
            detail.hidden = true;
            detail.innerHTML = '';
            return;
        }
        const axesHtml = (preset.axes || [])
            .map(function (axis, i) {
                return '<li><strong>Eje ' + (i + 1) + ':</strong> ' + App().escapeHtml(axis) + '</li>';
            })
            .join('');
        detail.hidden = false;
        detail.innerHTML =
            '<h4 class="analysis-alluvial-focus-detail-title">' + App().escapeHtml(preset.title) + '</h4>' +
            '<p class="analysis-alluvial-focus-detail-insight"><strong>Qué evalúa:</strong> ' +
            App().escapeHtml(preset.insight) +
            '</p>' +
            '<p class="analysis-alluvial-focus-detail-axes-label"><strong>Ejes del flujo:</strong></p>' +
            '<ul class="analysis-alluvial-focus-detail-axes">' +
            axesHtml +
            '</ul>' +
            (preset.missing && preset.missing.length
                ? '<p class="analysis-preview-note">Faltan variables en el dataset: ' +
                  App().escapeHtml(preset.missing.join(', ')) +
                  '</p>'
                : '');
    }

    function setAlluvialStages(columns) {
        const list = document.getElementById('desc13AlluvialStagesList');
        if (!list) return;
        desc13AlluvialApplyingPreset = true;
        list.innerHTML = '';
        (columns || []).forEach(function (col) {
            addAlluvialStageRow(col);
        });
        if (!columns || columns.length < 2) {
            while (list.querySelectorAll('.analysis-alluvial-stage-row').length < 2) {
                addAlluvialStageRow('');
            }
        }
        refreshAlluvialStageNumbers();
        refreshAlluvialStageSelects();
        desc13AlluvialApplyingPreset = false;
    }

    function applyAlluvialFocusPreset(preset) {
        if (!preset || !preset.available) return;
        setAlluvialStages(preset.stages);
        renderAlluvialFocusDetail(preset);
        scheduleAlluvialUpdate();
    }

    function initDesc13AlluvialFocusPresets() {
        const mount = document.getElementById('desc13AlluvialFocusPresets');
        if (!mount || !schema) return;
        const presets = getAlluvialFocusPresets();
        let html = '';
        let firstAvailable = null;
        presets.forEach(function (p) {
            if (p.available && !firstAvailable) firstAvailable = p;
            const disabled = p.available ? '' : ' disabled';
            html +=
                '<label class="analysis-alluvial-focus-preset' +
                (p.available ? '' : ' analysis-alluvial-focus-preset--disabled') +
                '">' +
                '<input type="radio" name="desc13AlluvialFocus" value="' +
                App().escapeHtml(p.id) +
                '"' +
                disabled +
                ' />' +
                '<span>' +
                App().escapeHtml(p.label) +
                '</span>' +
                '</label>';
        });
        html +=
            '<label class="analysis-alluvial-focus-preset">' +
            '<input type="radio" name="desc13AlluvialFocus" value="other" />' +
            '<span>Otro (selección manual de ejes)</span>' +
            '</label>';
        mount.innerHTML = html;
        mount.querySelectorAll('input[name="desc13AlluvialFocus"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (radio.value === 'other') {
                    renderAlluvialFocusDetail(null);
                    return;
                }
                const preset = getAlluvialFocusPresetById(radio.value);
                if (preset) applyAlluvialFocusPreset(preset);
            });
        });
        if (firstAvailable) {
            setAlluvialFocusRadio(firstAvailable.id);
            applyAlluvialFocusPreset(firstAvailable);
        } else {
            setAlluvialFocusRadio('other');
            renderAlluvialFocusDetail(null);
        }
    }

    function addAlluvialStageRow(column) {
        const list = document.getElementById('desc13AlluvialStagesList');
        if (!list) return;
        const maxStages = (schema && schema.presets && schema.presets.alluvial && schema.presets.alluvial.max_stages) || 8;
        if (list.querySelectorAll('.analysis-alluvial-stage-row').length >= maxStages) return;
        const row = document.createElement('div');
        row.className = 'analysis-alluvial-stage-row';
        row.innerHTML =
            '<span class="analysis-alluvial-stage-num"></span>' +
            '<select class="analysis-alluvial-stage-select analysis-desc-select-wide">' +
            buildAlluvialStageSelectOptions(column || '') +
            '</select>' +
            '<button type="button" class="analysis-alluvial-stage-btn" data-action="up" title="Mover arriba" aria-label="Mover arriba"><i class="fas fa-arrow-up"></i></button>' +
            '<button type="button" class="analysis-alluvial-stage-btn" data-action="down" title="Mover abajo" aria-label="Mover abajo"><i class="fas fa-arrow-down"></i></button>' +
            '<button type="button" class="analysis-alluvial-stage-btn analysis-alluvial-stage-btn-remove" data-action="remove" title="Quitar eje" aria-label="Quitar eje"><i class="fas fa-times"></i></button>';
        list.appendChild(row);
        if (column) {
            const sel = row.querySelector('.analysis-alluvial-stage-select');
            if (sel) sel.value = column;
        }
        refreshAlluvialStageNumbers();
        refreshAlluvialStageSelects();
    }

    function scheduleAlluvialUpdate() {
        if (desc13AlluvialTimer) clearTimeout(desc13AlluvialTimer);
        desc13AlluvialTimer = setTimeout(function () {
            desc13AlluvialTimer = null;
            const panel = document.querySelector('.analysis-desc13-panel[data-desc13-tab="alluvial"]');
            if (!panel || panel.hidden) return;
            runDesc13Alluvial();
        }, 450);
    }

    function initDesc13AlluvialUi() {
        const preset = schema && schema.presets && schema.presets.alluvial;
        const ready = !!(preset && preset.ready);
        const tab = document.getElementById('desc13TabAlluvial');
        const hint = document.getElementById('desc13AlluvialStageHint');
        const list = document.getElementById('desc13AlluvialStagesList');
        if (tab) {
            tab.disabled = !ready;
            tab.title = ready ? '' : 'Se requieren al menos 2 variables categóricas en el dataset';
        }
        if (hint) {
            hint.textContent = ready
                ? 'Mínimo 2 ejes · máximo ' + (preset.max_stages || 8)
                : 'No hay suficientes variables categóricas (2–15 categorías cada una)';
        }
        if (!list || !ready) return;

        initDesc13AlluvialFocusPresets();

        if (!desc13AlluvialBound) {
            desc13AlluvialBound = true;
            list.addEventListener('change', function (e) {
                if (e.target && e.target.classList.contains('analysis-alluvial-stage-select')) {
                    if (!desc13AlluvialApplyingPreset) {
                        setAlluvialFocusRadio('other');
                        renderAlluvialFocusDetail(null);
                    }
                    refreshAlluvialStageSelects();
                    scheduleAlluvialUpdate();
                }
            });
            list.addEventListener('click', function (e) {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const row = btn.closest('.analysis-alluvial-stage-row');
                if (!row) return;
                const action = btn.getAttribute('data-action');
                if (action === 'remove') {
                    if (list.querySelectorAll('.analysis-alluvial-stage-row').length <= 2) return;
                    row.remove();
                    setAlluvialFocusRadio('other');
                    renderAlluvialFocusDetail(null);
                    refreshAlluvialStageNumbers();
                    refreshAlluvialStageSelects();
                    scheduleAlluvialUpdate();
                    return;
                }
                if (action === 'up' && row.previousElementSibling) {
                    list.insertBefore(row, row.previousElementSibling);
                    setAlluvialFocusRadio('other');
                    renderAlluvialFocusDetail(null);
                    refreshAlluvialStageNumbers();
                    scheduleAlluvialUpdate();
                    return;
                }
                if (action === 'down' && row.nextElementSibling) {
                    list.insertBefore(row.nextElementSibling, row);
                    setAlluvialFocusRadio('other');
                    renderAlluvialFocusDetail(null);
                    refreshAlluvialStageNumbers();
                    scheduleAlluvialUpdate();
                }
            });
            document.getElementById('desc13AlluvialAddStage')?.addEventListener('click', function () {
                setAlluvialFocusRadio('other');
                renderAlluvialFocusDetail(null);
                addAlluvialStageRow('');
                scheduleAlluvialUpdate();
            });
        }
    }

    function pcpColorForGroup(groupName, index) {
        const g = String(groupName || '').toLowerCase();
        if (g.indexOf('normo') >= 0) return '#1f77b4';
        if (g.indexOf('sobre') >= 0) return '#ff7f0e';
        if (g.indexOf('obes') >= 0) return '#d62728';
        if (g.indexOf('bajo') >= 0) return '#2ca02c';
        return PLOTLY_PALETTE[index % PLOTLY_PALETTE.length];
    }

    function pcpGroupSortKey(name) {
        const g = String(name || '').toLowerCase();
        if (g.indexOf('normo') >= 0) return 0;
        if (g.indexOf('sobre') >= 0) return 1;
        if (g.indexOf('obes') >= 0) return 2;
        if (g.indexOf('bajo') >= 0) return 3;
        return 9;
    }

    function pcpGroupDisplayName(name) {
        const g = String(name || '').toLowerCase();
        if (g.indexOf('normo') >= 0) return 'Normopeso';
        if (g.indexOf('sobre') >= 0) return 'Sobrepeso';
        if (g.indexOf('obes') >= 0) return 'Obesidad';
        if (g.indexOf('bajo') >= 0) return 'Bajo peso';
        return name;
    }

    function pcpNormY(dim, raw) {
        const v = Number(raw);
        const r = dim.range || [0, 1];
        const lo = Number(r[0]);
        const hi = Number(r[1]);
        if (dim.kind === 'binary' || hi - lo < 1e-9) {
            return v <= 0 ? 0 : 1;
        }
        return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    }

    function pcpNiceTicks(lo, hi) {
        const span = hi - lo;
        let step = 5;
        if (span >= 200) step = 50;
        else if (span > 80) step = 20;
        else if (span > 40) step = 10;
        const ticks = [];
        for (let v = lo; v <= hi + 1e-6; v += step) {
            ticks.push(Math.round(v * 10) / 10);
        }
        if (!ticks.length) {
            ticks.push(Math.round(lo * 10) / 10, Math.round(hi * 10) / 10);
        }
        return ticks;
    }

    const PCP_FONT = {
        axis: { size: 13, color: '#0f172a' },
        tick: { size: 11, color: '#1e293b' },
        title: { size: 15, color: '#020617' },
        side: { size: 11, color: '#1e293b' },
        compareTitle: { size: 12, color: '#020617' }
    };

    const PCP_AXIS_SHORT = {
        sm_m: 'SM materno',
        'Síndrome metabólico materno': 'SM materno',
        'Sindrome metabolico materno': 'SM materno',
        'Diabetes materna': 'Diab. mat.',
        'Obesidad materna': 'Obes. mat.',
        'Lactancia materna': 'Lactancia',
        'Complicaciones': 'Complic.',
        'Exp. sustancias tóxicas': 'Exp. tóx.',
        'Curso normal': 'Curso norm.'
    };

    function pcpAxisTopLabel(dim) {
        const base = dim.label || dim.column || dim.axis_key || '';
        const key = dim.axis_key || dim.column || '';
        if (PCP_AXIS_SHORT[base]) return PCP_AXIS_SHORT[base];
        if (key && PCP_AXIS_SHORT[key]) return PCP_AXIS_SHORT[key];
        return base;
    }

    function renderPcpBiserialExplainPanel() {
        return (
            '<div class="analysis-pcp-biserial-explain">' +
            '<h4 class="analysis-pcp-assoc-title">¿Qué es la <em>r</em> biserial?</h4>' +
            '<p>La <strong>correlación biserial puntual</strong> mide la asociación entre cada factor perinatal binario (0 = No, 1 = Sí) y el marcador metabólico final del niño (valor continuo).</p>' +
            '<ul>' +
            '<li><strong>Valores cercanos a 0:</strong> poca relación lineal con el marcador.</li>' +
            '<li><strong>Valores positivos:</strong> cuando el factor es «Sí», el marcador tiende a ser más alto.</li>' +
            '<li><strong>Valores negativos:</strong> «Sí» se asocia con marcadores más bajos (posible perfil protector).</li>' +
            '<li><strong>|r| más alto:</strong> el eje se coloca más cerca del marcador final para facilitar la lectura del PCP (de mayor a menor asociación).</li>' +
            '</ul>' +
            '<p class="analysis-preview-note">Es una guía exploratoria descriptiva (no prueba de hipótesis). Con muestras pequeñas conviene interpretarla con cautela.</p>' +
            '<p class="analysis-preview-note">En el comparativo, el panel <strong>Percentil IMC</strong> usa la columna <em>Percentil_IMC</em> (rangos OMS: P&lt;15, P50-P75, P&gt;97…), no el IMC numérico en kg/m².</p>' +
            '</div>'
        );
    }

    function renderPcpAxisGuideHtml(dimensions) {
        const binary = (dimensions || []).filter(function (d) {
            return d.kind === 'binary';
        });
        if (!binary.length) return '';
        const items = binary
            .map(function (d, i) {
                return (
                    '<li><span class="analysis-pcp-axis-guide-idx">' +
                    (i + 1) +
                    '</span>' +
                    App().escapeHtml(d.label || d.column) +
                    '</li>'
                );
            })
            .join('');
        const outcome = (dimensions || []).find(function (d) {
            return d.kind === 'continuous';
        });
        let html =
            '<div class="analysis-pcp-axis-guide">' +
            '<p class="analysis-pcp-axis-guide-title"><strong>Ejes perinatales</strong> (izquierda → derecha, antes del marcador final)</p>' +
            '<ol class="analysis-pcp-axis-guide-list">' +
            items +
            '</ol>';
        if (outcome) {
            html +=
                '<p class="analysis-pcp-axis-guide-outcome">Marcador final: <strong>' +
                App().escapeHtml(outcome.label || outcome.column) +
                '</strong></p>';
        }
        html += '</div>';
        return html;
    }

    const PCP_CLUSTER_COLORS = ['#2ca02c', '#ff7f0e', '#d62728'];

    function pcpClusterColor(clusterIndex) {
        return PCP_CLUSTER_COLORS[clusterIndex % PCP_CLUSTER_COLORS.length];
    }

    function pcpDeterministicJitter(lineIdx, dimIdx, amplitude) {
        const h = (lineIdx * 17 + dimIdx * 31) % 997;
        return ((h / 497.5) - 1) * amplitude;
    }

    function getPcpPlotOptions() {
        return {
            jitter: document.getElementById('desc13PcpJitter')?.checked !== false,
            spline: document.getElementById('desc13PcpSpline')?.checked !== false,
            colorByCluster: document.getElementById('desc13PcpCluster')?.checked === true,
            opacity: 0.16
        };
    }

    function renderPcpAssociationTable(data) {
        const rows = data.axis_associations || [];
        if (!rows.length) return '';
        const method = data.axis_order_method || '';
        let html =
            '<div class="analysis-pcp-assoc-wrap">' +
            '<h4 class="analysis-pcp-assoc-title">Orden de ejes por asociación con el marcador final</h4>';
        if (method) {
            html += '<p class="analysis-preview-note">' + App().escapeHtml(method) + '</p>';
        }
        html +=
            '<table class="analysis-table analysis-pcp-assoc-table"><thead><tr>' +
            '<th>Variable</th><th>r biserial</th><th>|r|</th></tr></thead><tbody>';
        rows.forEach(function (row) {
            html +=
                '<tr><td>' +
                App().escapeHtml(row.label || row.column) +
                '</td><td>' +
                App().escapeHtml(String(row.biserial_r)) +
                '</td><td>' +
                App().escapeHtml(String(row.abs_r)) +
                '</td></tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function renderPcpClusterLegendHtml(clusterLabels) {
        return (clusterLabels || [])
            .map(function (label, i) {
                return (
                    '<span class="analysis-pcp-legend-item">' +
                    '<span class="analysis-pcp-legend-swatch" style="background:' +
                    pcpClusterColor(i) +
                    '"></span>' +
                    App().escapeHtml(label) +
                    '</span>'
                );
            })
            .join('');
    }

    function renderPcpLegendHtml(groups) {
        const sorted = (groups || []).slice().sort(function (a, b) {
            return pcpGroupSortKey(a) - pcpGroupSortKey(b);
        });
        return sorted
            .map(function (g, i) {
                const color = pcpColorForGroup(g, i);
                return (
                    '<span class="analysis-pcp-legend-item">' +
                    '<span class="analysis-pcp-legend-swatch" style="background:' +
                    color +
                    '"></span>' +
                    App().escapeHtml(pcpGroupDisplayName(g)) +
                    '</span>'
                );
            })
            .join('');
    }

    function renderPcpInfoPanels(data, colorLabel, outcomeLabel) {
        const n = data.n || 0;
        const outcome = outcomeLabel || data.outcome_label || data.outcome_column || 'marcador';
        return (
            '<div class="analysis-pcp-info-grid">' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Variables dicotómicas</h4>' +
            '<p>En los ejes binarios, <strong>1</strong> = Sí y <strong>0</strong> = No. Jitter vertical separa trayectorias.</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Cada línea representa a un niño</h4>' +
            '<p>Trayectoria suavizada hacia <strong>' +
            App().escapeHtml(outcome) +
            '</strong>. Pase el cursor sobre una línea para ver el detalle.</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Insight visual</h4>' +
            '<p>Busque concentración de obesidad/sobrepeso en valores altos; active clusters para perfiles protector, intermedio y adverso.</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Línea roja discontinua</h4>' +
            '<p>Marca el límite clínico en el marcador final (NHLBI/OMS/ATP III). En triglicéridos, No-HDL y percentil IMC, las trayectorias <strong>por encima</strong> de la línea están en rango alto/riesgo. En <strong>HDL</strong> ocurre al revés: <strong>por debajo</strong> de la línea (&lt;40 mg/dL) indica HDL bajo (riesgo).</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>' +
            App().escapeHtml(colorLabel) +
            '</h4>' +
            '<div class="analysis-pcp-legend">' +
            renderPcpLegendHtml(data.color_groups) +
            '</div>' +
            '<p class="analysis-pcp-info-n">n = ' +
            App().escapeHtml(String(n)) +
            ' niños con datos completos</p>' +
            '</div>' +
            '</div>'
        );
    }

    function pcpAddClinicalHighThreshold(shapes, annotations, dimensions, compare) {
        if (!dimensions || !dimensions.length) return;
        const lastIdx = dimensions.length - 1;
        const dim = dimensions[lastIdx];
        const thr = dim.clinical_high_threshold;
        if (!thr || thr.value == null || isNaN(Number(thr.value))) return;
        const yNorm = pcpNormY(dim, Number(thr.value));
        const halfW = compare ? 0.44 : 0.46;
        shapes.push({
            type: 'line',
            xref: 'x',
            yref: 'y',
            x0: lastIdx - halfW,
            x1: lastIdx + halfW,
            y0: yNorm,
            y1: yNorm,
            line: { color: '#dc2626', width: 2.5, dash: 'dash' }
        });
        const belowRisk = thr.direction === 'below_risk';
        annotations.push({
            x: lastIdx + (compare ? 0.35 : 0.4),
            y: belowRisk ? Math.max(0.02, yNorm - 0.05) : Math.min(1.18, yNorm + 0.04),
            xref: 'x',
            yref: 'y',
            text: thr.label || 'Alto',
            showarrow: false,
            font: { size: compare ? 9 : 10, color: '#dc2626' },
            xanchor: 'left',
            bgcolor: 'rgba(255,255,255,0.85)',
            borderpad: 2
        });
        if (belowRisk) {
            annotations.push({
                x: lastIdx - (compare ? 0.38 : 0.42),
                y: yNorm * 0.45,
                xref: 'x',
                yref: 'y',
                text: '↓ riesgo',
                showarrow: false,
                font: { size: compare ? 8 : 9, color: '#dc2626' },
                xanchor: 'right',
                bgcolor: 'rgba(255,255,255,0.8)',
                borderpad: 1
            });
        }
    }

    function buildPcpLayout(dimensions, titleText, layoutOpts) {
        layoutOpts = layoutOpts || {};
        const compare = layoutOpts.mode === 'compare';
        const shapes = [];
        const annotations = [
            {
                x: -0.32,
                y: 0.5,
                xref: 'x',
                yref: 'y',
                text: 'Bajo',
                showarrow: false,
                textangle: -90,
                font: PCP_FONT.side
            },
            {
                x: -0.32,
                y: 1.02,
                xref: 'x',
                yref: 'y',
                text: 'Alto',
                showarrow: false,
                textangle: -90,
                font: PCP_FONT.side
            }
        ];
        const lastIdx = dimensions.length - 1;
        dimensions.forEach(function (dim, di) {
            shapes.push({
                type: 'line',
                x0: di,
                x1: di,
                y0: 0,
                y1: 1,
                xref: 'x',
                yref: 'y',
                line: { color: '#1e293b', width: compare ? 1.35 : 1.6 }
            });
            const showAxisName = !compare || di === lastIdx;
            if (showAxisName) {
                const isLastCompare = compare && di === lastIdx;
                annotations.push({
                    x: di,
                    y: compare ? 1.08 : 1.14,
                    xref: 'x',
                    yref: 'y',
                    text: pcpAxisTopLabel(dim),
                    showarrow: false,
                    textangle: compare && dim.kind === 'binary' ? -32 : 0,
                    xanchor: isLastCompare ? 'right' : 'center',
                    xshift: isLastCompare ? -18 : 0,
                    font: compare ? { size: 11, color: '#0f172a' } : PCP_FONT.axis
                });
            }
            if (dim.kind === 'binary') {
                if (!compare && di === 0) {
                    annotations.push(
                        { x: di, y: 1.02, xref: 'x', yref: 'y', text: 'Sí', showarrow: false, font: PCP_FONT.tick },
                        { x: di, y: -0.02, xref: 'x', yref: 'y', text: 'No', showarrow: false, font: PCP_FONT.tick }
                    );
                } else if (!compare) {
                    annotations.push(
                        { x: di, y: 1.02, xref: 'x', yref: 'y', text: 'Sí', showarrow: false, font: { size: 10, color: '#334155' } },
                        { x: di, y: -0.02, xref: 'x', yref: 'y', text: 'No', showarrow: false, font: { size: 10, color: '#334155' } }
                    );
                }
            } else if (dim.kind === 'ordinal' && dim.tickvals && dim.tickvals.length) {
                const tickvals = dim.tickvals;
                const ticktext = dim.ticktext || tickvals.map(String);
                const pick = compare
                    ? [0, Math.floor((tickvals.length - 1) / 2), tickvals.length - 1]
                    : tickvals.map(function (_v, i) {
                          return i;
                      });
                pick.forEach(function (ti) {
                    if (ti < 0 || ti >= tickvals.length) return;
                    annotations.push({
                        x: di,
                        y: pcpNormY(dim, tickvals[ti]),
                        xref: 'x',
                        yref: 'y',
                        text: String(ticktext[ti] || tickvals[ti]),
                        showarrow: false,
                        xanchor: 'right',
                        xshift: compare ? -6 : -10,
                        font: PCP_FONT.tick
                    });
                });
            } else {
                const r = dim.range || [0, 1];
                const lo = Number(r[0]);
                const hi = Number(r[1]);
                const ticks = pcpNiceTicks(lo, hi);
                const useTicks = compare
                    ? [ticks[0], ticks[Math.floor(ticks.length / 2)], ticks[ticks.length - 1]].filter(function (v, i, a) {
                          return v != null && a.indexOf(v) === i;
                      })
                    : ticks;
                useTicks.forEach(function (tickVal) {
                    annotations.push({
                        x: di,
                        y: pcpNormY(dim, tickVal),
                        xref: 'x',
                        yref: 'y',
                        text: String(Math.round(tickVal)),
                        showarrow: false,
                        xanchor: 'right',
                        xshift: compare ? -6 : -10,
                        font: PCP_FONT.tick
                    });
                });
            }
        });
        pcpAddClinicalHighThreshold(shapes, annotations, dimensions, compare);
        return {
            margin: compare ? { t: 62, r: 28, b: 28, l: 46 } : { t: 96, r: 32, b: 40, l: 56 },
            title: {
                text: titleText,
                font: compare ? PCP_FONT.compareTitle : PCP_FONT.title,
                x: 0.5,
                xanchor: 'center'
            },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: { family: 'Segoe UI, system-ui, sans-serif', color: '#0f172a', size: 12 },
            xaxis: {
                range: compare
                    ? [-0.42, dimensions.length - 0.35]
                    : [-0.42, dimensions.length - 0.58],
                showticklabels: false,
                showgrid: false,
                zeroline: false,
                showline: false
            },
            yaxis: {
                range: compare ? [-0.1, 1.22] : [-0.12, 1.24],
                showticklabels: false,
                showgrid: false,
                zeroline: false,
                showline: false,
                title: compare
                    ? undefined
                    : {
                          text: 'Binarios (0/1) y marcador normalizado',
                          font: { size: 12, color: '#1e293b' }
                      }
            },
            shapes: shapes,
            annotations: annotations,
            showlegend: false,
            hovermode: 'closest',
            hoverlabel: { font: { size: 12, color: '#0f172a' } }
        };
    }

    function plotParcoords(containerId, data, options) {
        if (!window.Plotly || !data?.dimensions?.length) return;
        options = options || getPcpPlotOptions();
        const dimensions = data.dimensions;
        const nLines = dimensions[0].values.length;
        const allGroups = data.color_groups || [];
        const linesMeta = data.lines_meta || [];
        const traces = [];
        const jitterAmp = 0.075;
        const drawOrder = [];
        for (let li = 0; li < nLines; li++) drawOrder.push(li);
        drawOrder.sort(function (a, b) {
            const oa = Number((linesMeta[a] || {}).outcome) || 0;
            const ob = Number((linesMeta[b] || {}).outcome) || 0;
            return oa - ob;
        });

        drawOrder.forEach(function (li) {
            const xs = [];
            const ys = [];
            dimensions.forEach(function (dim, di) {
                xs.push(di);
                let y = pcpNormY(dim, dim.values[li]);
                if (options.jitter && dim.kind === 'binary') {
                    y += pcpDeterministicJitter(li, di, jitterAmp);
                    y = Math.max(-0.04, Math.min(1.04, y));
                }
                ys.push(y);
            });
            const meta = linesMeta[li] || {};
            let color;
            if (options.colorByCluster && data.line_cluster && data.line_cluster.length) {
                const ci = data.line_cluster[li] || 0;
                color = pcpClusterColor(ci);
            } else {
                const gName = allGroups[data.line_color[li]] || meta.group || '';
                color = pcpColorForGroup(gName, data.line_color[li] || 0);
            }
            const lastDim = dimensions[dimensions.length - 1];
            const outcomeVal =
                meta.outcome != null
                    ? meta.outcome
                    : lastDim.kind === 'ordinal' && lastDim.ticktext
                      ? lastDim.ticktext[lastDim.tickvals.indexOf(lastDim.values[li])] || lastDim.values[li]
                      : lastDim.values[li];
            let detailLabel = '';
            if (options.colorByCluster && data.line_cluster && data.line_cluster.length) {
                const ci = data.line_cluster[li] || 0;
                detailLabel = meta.cluster_label || (data.cluster_labels || [])[ci] || 'Cluster ' + (ci + 1);
            } else {
                const gName = allGroups[data.line_color[li]] || meta.group || '';
                detailLabel = pcpGroupDisplayName(gName);
            }
            const childIdx = (meta.line_index != null ? meta.line_index : li) + 1;
            const hoverRow = [childIdx, detailLabel, outcomeVal];
            traces.push({
                type: 'scatter',
                mode: 'lines',
                name: 'niño-' + childIdx,
                x: xs,
                y: ys,
                line: {
                    color: color,
                    width: 1.15,
                    shape: options.spline ? 'spline' : 'linear',
                    smoothing: options.spline ? 1.12 : 0
                },
                opacity: options.opacity != null ? options.opacity : 0.16,
                hovertemplate:
                    '<b>Niño %{customdata[0]}</b><br>%{customdata[1]}<br>Marcador: %{customdata[2]}<extra></extra>',
                customdata: xs.map(function () {
                    return hoverRow;
                }),
                showlegend: false
            });
        });

        const outcomeLabel = data.outcome_label || data.outcome_column || 'marcador del niño';
        const compare = options.layoutMode === 'compare';
        const titleText = compare
            ? String(outcomeLabel)
            : 'PCP — factores perinatales y ' + String(outcomeLabel).toLowerCase();
        Plotly.newPlot(
            containerId,
            traces,
            buildPcpLayout(dimensions, titleText, { mode: compare ? 'compare' : 'full' }),
            plotlyConfig()
        );
    }

    function alluvialCategoryColor(kind, category) {
        const g = String(category || '').toLowerCase();
        if (kind === 'weight') {
            if (g.indexOf('normo') >= 0) return '#1f77b4';
            if (g.indexOf('sobre') >= 0) return '#ff7f0e';
            if (g.indexOf('obes') >= 0) return '#d62728';
            if (g.indexOf('bajo') >= 0) return '#2ca02c';
        }
        if (kind === 'birth_weight') {
            if (g.indexOf('bajo') >= 0) return '#bcbd22';
            if (g.indexOf('macro') >= 0) return '#e377c2';
            return '#98df8a';
        }
        if (kind === 'termino') {
            if (g.indexOf('pre') >= 0) return '#ff9896';
            if (g.indexOf('post') >= 0) return '#c49c94';
            return '#aec7e8';
        }
        if (kind === 'escolaridad') {
            if (g.indexOf('bás') >= 0 || g.indexOf('bas') >= 0) return '#c5b0d5';
            if (g.indexOf('media') >= 0) return '#17becf';
            return '#2ca02c';
        }
        if (kind === 'parto') {
            if (g.indexOf('ces') >= 0) return '#8c564b';
            return '#17becf';
        }
        if (kind === 'binary') {
            if (g === 'sí' || g === 'si') return '#9467bd';
            return '#c7c7c7';
        }
        let h = 0;
        for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) % PLOTLY_PALETTE.length;
        return PLOTLY_PALETTE[h];
    }

    function alluvialLinkColor(hex) {
        if (!hex || hex.charAt(0) !== '#') return 'rgba(100,116,139,0.35)';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',0.38)';
    }

    function renderAlluvialInfoPanels(data) {
        const stages = (data.stages || [])
            .map(function (s) {
                return s.title;
            })
            .join(' → ');
        return (
            '<div class="analysis-pcp-info-grid">' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Flujo categórico</h4>' +
            '<p>Cada banda representa una proporción de niños que comparten la misma secuencia: <strong>' +
            App().escapeHtml(stages) +
            '</strong>.</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Altura de las bandas</h4>' +
            '<p>El grosor es proporcional al número de niños en esa combinación (n total = ' +
            App().escapeHtml(String(data.n || 0)) +
            ', rutas distintas = ' +
            App().escapeHtml(String(data.path_count || 0)) +
            ').</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Insight visual</h4>' +
            '<p>Busque caminos anchos hacia <strong>Obesidad</strong> o <strong>Sobrepeso</strong>, por ejemplo desde «SM = Sí» y «Cesárea».</p>' +
            '</div>' +
            '<div class="analysis-pcp-info-card">' +
            '<h4>Condición de peso</h4>' +
            '<p>Eje final: distribución de normopeso, sobrepeso, obesidad y bajo peso según el perfil perinatal.</p>' +
            '</div>' +
            '</div>'
        );
    }

    function plotAlluvial(containerId, data) {
        if (!window.Plotly || !data?.nodes?.length) return;
        const nodes = data.nodes;
        const links = data.links || [];
        const stages = data.stages || [];
        const stageCount = stages.length;
        const denom = Math.max(stageCount - 1, 1);
        const nodeX = nodes.map(function (n) {
            return 0.001 + (n.stage / denom) * 0.998;
        });
        const nodeColors = nodes.map(function (n) {
            return alluvialCategoryColor(n.stage_kind || 'categorical', n.category);
        });
        const linkColors = links.map(function (l) {
            const src = nodes[l.source];
            return alluvialLinkColor(alluvialCategoryColor(src.stage_kind || 'categorical', src.category));
        });
        const annotations = stages.map(function (st, i) {
            return {
                x: 0.001 + (i / denom) * 0.998,
                y: 1.06,
                xref: 'paper',
                yref: 'paper',
                text: '<b>' + st.title + '</b>',
                showarrow: false,
                font: { size: 11, color: '#1e293b' },
                xanchor: 'center'
            };
        });
        Plotly.newPlot(
            containerId,
            [
                {
                    type: 'sankey',
                    arrangement: 'snap',
                    orientation: 'h',
                    node: {
                        pad: 20,
                        thickness: 24,
                        line: { color: '#334155', width: 0.5 },
                        label: nodes.map(function (n) {
                            return n.category;
                        }),
                        color: nodeColors,
                        x: nodeX,
                        hovertemplate: '%{label}<extra></extra>'
                    },
                    link: {
                        source: links.map(function (l) {
                            return l.source;
                        }),
                        target: links.map(function (l) {
                            return l.target;
                        }),
                        value: links.map(function (l) {
                            return l.value;
                        }),
                        color: linkColors,
                        hovertemplate: '%{value} niños<extra></extra>'
                    }
                }
            ],
            {
                margin: { t: 72, r: 48, b: 32, l: 48 },
                title: {
                    text: 'Diagrama de aluvión: factores perinatales y condición de peso',
                    font: { size: 14, color: '#111827' },
                    x: 0.5,
                    xanchor: 'center'
                },
                annotations: annotations,
                font: { size: 12, color: '#334155' },
                paper_bgcolor: '#ffffff'
            },
            plotlyConfig()
        );
    }

    async function runDesc13Alluvial() {
        const mount = document.getElementById('desc13AlluvialResults');
        if (!mount) return;
        const stages = getSelectedAlluvialStages();
        if (stages.length < 2) {
            mount.innerHTML =
                '<p class="analysis-preview-note">Seleccione al menos 2 variables para construir el flujo.</p>';
            return;
        }
        if (new Set(stages).size !== stages.length) {
            mount.innerHTML =
                '<p class="analysis-preview-note">Cada variable solo puede aparecer una vez en el flujo.</p>';
            return;
        }
        App().showLoading('Actualizando diagrama de aluvión...');
        try {
            const data = await postJson('/descriptivo/alluvial', { stages: stages });
            const cId = plotId('desc13alluvial');
            mount.innerHTML =
                '<div id="' +
                cId +
                '" class="analysis-chart analysis-chart-alluvial"></div>' +
                renderAlluvialInfoPanels(data);
            plotAlluvial(cId, data);
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    let cachedDesc13Pcp = null;
    let cachedDesc13PcpCompare = null;

    function refreshDesc13PcpPlot() {
        if (!cachedDesc13Pcp) return;
        plotParcoords(cachedDesc13Pcp.chartId, cachedDesc13Pcp.data, getPcpPlotOptions());
        const legendEl = document.querySelector('#desc13PcpResults .analysis-pcp-legend');
        if (legendEl && cachedDesc13Pcp.data) {
            const opts = getPcpPlotOptions();
            legendEl.innerHTML = opts.colorByCluster
                ? renderPcpClusterLegendHtml(cachedDesc13Pcp.data.cluster_labels)
                : renderPcpLegendHtml(cachedDesc13Pcp.data.color_groups);
        }
    }

    function refreshDesc13PcpComparePlots() {
        if (!cachedDesc13PcpCompare) return;
        const opts = Object.assign({}, getPcpPlotOptions(), { layoutMode: 'compare' });
        cachedDesc13PcpCompare.panels.forEach(function (p) {
            if (p.chartId && p.data) plotParcoords(p.chartId, p.data, opts);
        });
    }

    function initDesc13PcpViews() {
        document.querySelectorAll('.analysis-desc13-subtab[data-pcp-view]').forEach(function (tab) {
            tab.addEventListener('click', function () {
                const view = tab.getAttribute('data-pcp-view');
                document.querySelectorAll('.analysis-desc13-subtab[data-pcp-view]').forEach(function (t) {
                    const on = t === tab;
                    t.classList.toggle('active', on);
                    t.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                const single = document.getElementById('desc13PcpSingleView');
                const compare = document.getElementById('desc13PcpCompareView');
                if (single) {
                    single.classList.toggle('active', view === 'single');
                    single.hidden = view !== 'single';
                }
                if (compare) {
                    compare.classList.toggle('active', view === 'compare');
                    compare.hidden = view !== 'compare';
                }
            });
        });
        ['desc13PcpJitter', 'desc13PcpSpline', 'desc13PcpCluster'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('change', function () {
                refreshDesc13PcpPlot();
                refreshDesc13PcpComparePlots();
            });
        });
    }

    async function runDesc13Pcp() {
        const outcome = document.getElementById('desc13PcpOutcome')?.value;
        const mount = document.getElementById('desc13PcpResults');
        if (!outcome || !mount) {
            App().showToast('Seleccione un marcador metabólico', 'info');
            return;
        }
        App().showLoading('Generando coordenadas paralelas...');
        try {
            const reorder = document.getElementById('desc13PcpReorder')?.checked !== false;
            const data = await postJson('/descriptivo/pcp', {
                outcome: outcome,
                reorder_axes: reorder,
                compute_clusters: true
            });
            const cId = plotId('desc13pcp');
            const colorLabel = schema?.suggested_weight_column || data.color_column || 'Condición de peso del niño';
            const outcomeLabel = data.outcome_label || outcome;
            mount.innerHTML =
                '<div id="' +
                cId +
                '" class="analysis-chart analysis-chart-pcp"></div>' +
                renderPcpBiserialExplainPanel() +
                renderPcpAssociationTable(data) +
                renderPcpInfoPanels(data, colorLabel, outcomeLabel);

            cachedDesc13Pcp = { chartId: cId, data: data };
            plotParcoords(cId, data, getPcpPlotOptions());
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
            cachedDesc13Pcp = null;
        } finally {
            App().hideLoading();
        }
    }

    async function runDesc13PcpCompare() {
        const mount = document.getElementById('desc13PcpCompareResults');
        if (!mount) return;
        const reorder = document.getElementById('desc13PcpReorder')?.checked !== false;
        App().showLoading('Generando comparativo PCP...');
        try {
            const resp = await postJson('/descriptivo/pcp-compare', {
                reorder_axes: reorder,
                compute_clusters: true
            });
            const panels = (resp.panels || []).filter(function (p) {
                return p.available;
            });
            if (!panels.length) {
                mount.innerHTML =
                    '<p class="analysis-preview-note">No hay paneles disponibles con datos completos para TG, No-HDL e IMC.</p>';
                cachedDesc13PcpCompare = null;
                return;
            }
            const chartPanels = [];
            let html = '<div class="analysis-pcp-compare-grid">';
            panels.forEach(function (p, i) {
                const cId = plotId('desc13pcpcmp' + i);
                const panelTitle = p.title || p.outcome_label || 'Panel ' + (i + 1);
                html +=
                    '<div class="analysis-pcp-compare-cell">' +
                    '<h4 class="analysis-pcp-compare-label">' +
                    String.fromCharCode(65 + i) +
                    '. ' +
                    App().escapeHtml(panelTitle) +
                    '</h4>' +
                    '<div id="' +
                    cId +
                    '" class="analysis-chart analysis-chart-pcp analysis-chart-pcp-sm"></div>' +
                    '</div>';
                chartPanels.push({ chartId: cId, data: p });
            });
            html += '</div>';
            if (panels[0] && panels[0].dimensions) {
                html += renderPcpAxisGuideHtml(panels[0].dimensions);
            }
            html +=
                '<p class="analysis-preview-note">Mismo orden de ejes perinatales; solo cambia el marcador final. n ≈ ' +
                App().escapeHtml(String(panels[0].n || '')) +
                ' niños.</p>';
            html += renderPcpBiserialExplainPanel();
            if (panels[0] && panels[0].axis_associations) {
                html += renderPcpAssociationTable(panels[0]);
            }
            mount.innerHTML = html;
            const opts = Object.assign({}, getPcpPlotOptions(), { layoutMode: 'compare' });
            chartPanels.forEach(function (cp) {
                plotParcoords(cp.chartId, cp.data, opts);
            });
            cachedDesc13PcpCompare = { panels: chartPanels };
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
            cachedDesc13PcpCompare = null;
        } finally {
            App().hideLoading();
        }
    }

    async function renderDesc11Comparison(col, groupBy, compareMount) {
        if (isNumericColumn(col)) {
            const data = await postJson('/descriptivo/grouped', { columns: [col], group_by: groupBy });
            const tbl = (data.numeric_tables || []).find(function (t) {
                return t.variable === col;
            });
            const bp = (data.boxplots || []).find(function (b) {
                return b.variable === col;
            });
            let html = '';
            if (tbl && tbl.groups && tbl.groups.length) {
                html += renderTableHtml(
                    ['Grupo', 'n', 'Media', 'Mediana', 'DE', 'Mín', 'Máx'],
                    tbl.groups.map(function (g) {
                        return [g.group, g.n, g.mean, g.median, g.std, g.min, g.max];
                    })
                );
            }
            const cId = plotId('desc11c');
            html += '<div id="' + cId + '" class="analysis-chart"></div>';
            compareMount.innerHTML = html;
            if (bp && bp.groups) {
                plotBoxplot(cId, bp.groups, {
                    title: '',
                    yaxis: { title: col },
                    xaxis: { title: groupBy }
                });
            }
            return;
        }

        const ct = await postJson('/descriptivo/crosstab', { column: col, group_by: groupBy });
        const rows = [];
        const categoryCount = new Set();
        ct.groups.forEach(function (g) {
            g.cells.forEach(function (c) {
                categoryCount.add(c.category);
                rows.push([g.group, c.category, c.count, c.row_percent]);
            });
        });
        let html = renderTableHtml(['Grupo', col, 'n', '% fila'], rows);
        if (categoryCount.size > 0 && categoryCount.size <= 12) {
            const cId = plotId('desc11c');
            html += '<div id="' + cId + '" class="analysis-chart"></div>';
            compareMount.innerHTML = html;
            plotStackedBar(cId, ct);
        } else if (categoryCount.size > 12) {
            html +=
                '<p class="analysis-preview-note">Esta variable tiene muchas categorías; la tabla resume la distribución por grupo.</p>';
            compareMount.innerHTML = html;
        } else {
            compareMount.innerHTML = html || '<p class="analysis-preview-note">Sin datos para comparar.</p>';
        }
    }

    async function run11() {
        const col = document.getElementById('desc11Var')?.value;
        const groupBy = document.getElementById('desc11GroupBy')?.value;
        const boxGroup = document.getElementById('desc11BoxGroup')?.value;
        const mount = document.getElementById('desc11Results');
        const compareMount = document.getElementById('desc11CompareResults');
        if (!col || !mount) {
            App().showToast('Seleccione una variable', 'info');
            return;
        }
        desc11LastCol = col;
        updateDesc11CompareUI();
        mount.innerHTML = '';
        if (compareMount) compareMount.innerHTML = '';
        App().showLoading('Calculando...');
        try {
            const body = { column: col };
            if (boxGroup && isNumericColumn(col)) {
                body.group_by = boxGroup;
            }
            const data = await postJson('/descriptivo/univariate', body);
            let html = '';
            if (data.kind === 'numeric') {
                const s = data.summary;
                html +=
                    '<h4>Estadísticos descriptivos</h4>' +
                    renderTableHtml(
                        ['n', 'Media', 'Mediana', 'DE', 'Varianza', 'Mín', 'Máx', 'Q1', 'Q3', 'RIC'],
                        [
                            [
                                s.n,
                                s.mean,
                                s.median,
                                s.std,
                                s.variance,
                                s.min,
                                s.max,
                                s.q1,
                                s.q3,
                                s.iqr
                            ]
                        ]
                    );
                const hId = plotId('desc11h');
                const bId = plotId('desc11b');
                html += '<div class="analysis-chart-row"><div id="' + hId + '" class="analysis-chart"></div></div>';
                html += '<div id="' + bId + '" class="analysis-chart"></div>';
                mount.innerHTML = html;
                plotHistogram(hId, data.histogram);
                const boxLayout = boxGroup
                    ? { title: '', yaxis: { title: col }, xaxis: { title: boxGroup } }
                    : {};
                plotBoxplot(bId, data.boxplot, boxLayout);
            } else {
                html += '<h4>Tabla de frecuencias</h4>';
                html += renderTableHtml(
                    ['Categoría', 'n', '%'],
                    (data.frequencies || []).map(function (f) {
                        return [f.category, f.count, f.percent];
                    })
                );
                const pId = plotId('desc11p');
                html += '<div id="' + pId + '" class="analysis-chart"></div>';
                mount.innerHTML = html;
                plotPie(pId, data.frequencies);

                if (boxGroup && isNumericColumn(boxGroup)) {
                    const numData = await postJson('/descriptivo/univariate', {
                        column: boxGroup,
                        group_by: col
                    });
                    if (numData.kind === 'numeric') {
                        const s = numData.summary;
                        let extra =
                            '<h4 class="analysis-desc-block-title">Distribución de ' +
                            App().escapeHtml(boxGroup) +
                            ' por ' +
                            App().escapeHtml(col) +
                            '</h4>' +
                            renderTableHtml(
                                ['n', 'Media', 'Mediana', 'DE', 'Varianza', 'Mín', 'Máx', 'Q1', 'Q3', 'RIC'],
                                [
                                    [
                                        s.n,
                                        s.mean,
                                        s.median,
                                        s.std,
                                        s.variance,
                                        s.min,
                                        s.max,
                                        s.q1,
                                        s.q3,
                                        s.iqr
                                    ]
                                ]
                            );
                        const hId = plotId('desc11h');
                        const bId = plotId('desc11b');
                        extra +=
                            '<div class="analysis-chart-row"><div id="' +
                            hId +
                            '" class="analysis-chart"></div></div>';
                        extra += '<div id="' + bId + '" class="analysis-chart"></div>';
                        mount.innerHTML = html + extra;
                        plotPie(pId, data.frequencies);
                        plotHistogram(hId, numData.histogram);
                        plotBoxplot(bId, numData.boxplot, {
                            title: '',
                            yaxis: { title: boxGroup },
                            xaxis: { title: col }
                        });
                    }
                }
            }
            updateDesc11CompareUI();
            if (groupBy && compareMount) {
                await renderDesc11Comparison(col, groupBy, compareMount);
            }
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
            if (compareMount) compareMount.innerHTML = '';
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function run12Block(kind) {
        const isAnthro = kind === 'anthro';
        const sel = document.getElementById(isAnthro ? 'desc12AnthroVar' : 'desc12LipidVar');
        const groupBy = document.getElementById('desc12GroupBy')?.value;
        const mount = document.getElementById(isAnthro ? 'desc12AnthroResults' : 'desc12LipidResults');
        const col = sel ? sel.value : '';
        if (!col || !groupBy) {
            App().showToast('Seleccione variable y agrupación', 'info');
            return;
        }
        App().showLoading('Calculando...');
        try {
            const data = await postJson('/descriptivo/grouped', { columns: [col], group_by: groupBy });
            const tbl = (data.numeric_tables || []).find(function (t) {
                return t.variable === col;
            });
            const bp = (data.boxplots || []).find(function (b) {
                return b.variable === col;
            });
            if (tbl && tbl.groups && tbl.groups.length) {
                let html =
                    '<h4>Estadísticos de ' +
                    App().escapeHtml(col) +
                    ' por ' +
                    App().escapeHtml(groupBy) +
                    '</h4>';
                html += renderTableHtml(
                    ['Grupo', 'n', 'Media', 'Mediana', 'DE', 'Mín', 'Máx'],
                    tbl.groups.map(function (g) {
                        return [g.group, g.n, g.mean, g.median, g.std, g.min, g.max];
                    })
                );
                const bId = plotId('desc12b');
                html += '<div id="' + bId + '" class="analysis-chart"></div>';
                mount.innerHTML = html;
                if (bp && bp.groups) {
                    plotBoxplot(bId, bp.groups, {
                        title: '',
                        yaxis: { title: col },
                        xaxis: { title: groupBy }
                    });
                }
            } else {
                mount.innerHTML =
                    '<p class="analysis-preview-note">Sin resultados numéricos para esta variable.</p>';
            }
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    async function run14() {
        const cols = Array.from(document.getElementById('desc14Vars')?.selectedOptions || []).map(function (o) {
            return o.value;
        });
        const mount = document.getElementById('desc14Results');
        const byCondition = document.getElementById('desc14ByCondition')?.checked;
        if (cols.length < 2) {
            App().showToast('Seleccione al menos 2 variables numéricas', 'info');
            return;
        }
        App().showLoading('Calculando matriz de correlación...');
        try {
            const body = { columns: cols };
            if (byCondition) {
                if (!schema?.suggested_weight_column) {
                    App().showToast('No se detectó la variable Condición en el dataset', 'info');
                    return;
                }
                body.group_by = schema.suggested_weight_column;
            }
            const data = await postJson('/descriptivo/correlation', body);
            if (data.by_group && data.matrices && data.matrices.length) {
                const groupName = data.group_by || schema.suggested_weight_column || 'Condición';
                let html = '';
                const charts = [];
                data.matrices.forEach(function (m) {
                    if (m.error) {
                        html +=
                            '<h4 class="analysis-corr-matrix-title">' +
                            App().escapeHtml(m.group) +
                            '</h4><p class="analysis-preview-note">' +
                            App().escapeHtml(m.error) +
                            (m.n != null ? ' (n=' + m.n + ')' : '') +
                            '</p>';
                        return;
                    }
                    const hId = plotId('desc14h');
                    html +=
                        '<h4 class="analysis-corr-matrix-title">' +
                        App().escapeHtml(m.group) +
                        ' · ' +
                        App().escapeHtml(groupName) +
                        '</h4>' +
                        renderCorrMethodNote(m) +
                        '<div id="' +
                        hId +
                        '" class="analysis-chart analysis-chart-wide analysis-chart-heatmap"></div>';
                    charts.push({
                        id: hId,
                        payload: m,
                        title:
                            m.group +
                            ' (' +
                            groupName +
                            ') — ' +
                            corrMethodLabel(m.method) +
                            (heatmapSampleTitle(m) ? ' · ' + heatmapSampleTitle(m) : '')
                    });
                });
                mount.innerHTML = html || '<p class="analysis-preview-note">Sin matrices para mostrar.</p>';
                charts.forEach(function (c) {
                    plotHeatmap(c.id, c.payload, { title: c.title });
                });
            } else {
                const hId = plotId('desc14h');
                mount.innerHTML =
                    renderCorrMethodNote(data) +
                    '<div id="' +
                    hId +
                    '" class="analysis-chart analysis-chart-wide analysis-chart-heatmap"></div>';
                plotHeatmap(hId, data);
            }
        } catch (err) {
            mount.innerHTML = '<p class="analysis-preview-note">' + App().escapeHtml(err.message) + '</p>';
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('desc11Run')?.addEventListener('click', run11);
        document.getElementById('desc11Var')?.addEventListener('change', function () {
            updateDesc11DistribPor();
            updateDesc11CompararPor();
            updateDesc11CompareUI();
        });
        document.getElementById('desc11GroupBy')?.addEventListener('change', refreshDesc11Comparison);
        document.getElementById('desc12AnthroRun')?.addEventListener('click', function () {
            run12Block('anthro');
        });
        document.getElementById('desc12LipidRun')?.addEventListener('click', function () {
            run12Block('lipid');
        });
        initDesc13Tabs();
        initDesc13PcpViews();
        document.getElementById('desc13PcpRun')?.addEventListener('click', runDesc13Pcp);
        document.getElementById('desc13PcpCompareRun')?.addEventListener('click', runDesc13PcpCompare);
        document.getElementById('desc13HeatmapRun')?.addEventListener('click', runDesc13Heatmap);
        document.getElementById('desc13RadarRun')?.addEventListener('click', runDesc13Radar);
        document.getElementById('desc13DensityRun')?.addEventListener('click', runDesc13Density);
        document.getElementById('desc13ScatterRun')?.addEventListener('click', runDesc13Scatter);
        document.getElementById('desc14Run')?.addEventListener('click', run14);
        document.getElementById('desc14CustomScatterRun')?.addEventListener('click', runDesc14CustomScatter);

        const tab = document.getElementById('tabPrelimDescriptivo');
        tab?.addEventListener('click', function () {
            if (getDatasetId()) loadSchema();
        });
    }

    function init() {
        bindControls();
        if (getDatasetId()) loadSchema();
        else showNoDataMessage(true);
    }

    function onDatasetChanged() {
        loadSchema();
    }

    window.AnalysisDescriptivo = {
        init: init,
        onDatasetChanged: onDatasetChanged,
        refreshSchema: loadSchema
    };
})();
