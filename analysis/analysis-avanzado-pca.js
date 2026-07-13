/**
 * PCA — análisis avanzado (rotación, biplot, varianza explicada).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let pcaSchema = null;
    let plotCounter = 0;

    function plotId(prefix) {
        plotCounter += 1;
        return prefix + '-' + plotCounter;
    }

    function getDatasetId() {
        const ds = App().state.activeDataset;
        return ds && ds.id ? ds.id : null;
    }

    async function parseResponse(res) {
        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            throw new Error(
                res.ok
                    ? 'Respuesta inválida del servidor'
                    : 'Error ' + res.status + ' — reinicie el servidor si acaba de actualizar el código'
            );
        }
        if (!res.ok) {
            throw new Error(data.detail || data.message || 'Error en la solicitud');
        }
        return data;
    }

    async function apiGet(path) {
        return parseResponse(await fetch(API() + path));
    }

    async function apiPost(path, body) {
        return parseResponse(
            await fetch(API() + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {})
            })
        );
    }

    function showPcaStep(step) {
        const setup = document.getElementById('pcaStepSetup');
        const results = document.getElementById('pcaStepResults');
        if (setup) setup.hidden = step !== 'setup';
        if (results) results.hidden = step !== 'results';
    }

    function resetPca() {
        showPcaStep('setup');
        const mount = document.getElementById('pcaResultsMount');
        if (mount) mount.innerHTML = '';
    }

    function renderVariables(variables) {
        const mount = document.getElementById('pcaVariablesMount');
        if (!mount) return;
        const items = variables || [];
        mount.innerHTML =
            '<p class="analysis-infer-stat-line"><strong>Variables activas</strong> (estandarizadas en el análisis):</p>' +
            '<div class="analysis-avanz-vars-grid">' +
            items
                .map(function (v) {
                    const cls = v.available ? 'analysis-avanz-var-chip--ok' : 'analysis-avanz-var-chip--missing';
                    const tag = v.derived ? ' <em>(calculada)</em>' : '';
                    const state = v.available
                        ? ' · n=' + v.n_valid
                        : ' · no disponible';
                    return (
                        '<div class="analysis-avanz-var-chip ' +
                        cls +
                        '">' +
                        App().escapeHtml(v.label) +
                        tag +
                        '<br><span style="font-size:0.78rem;color:#64748b">' +
                        App().escapeHtml(v.domain_label || '') +
                        state +
                        '</span></div>'
                    );
                })
                .join('') +
            '</div>';
    }

    function fillRotationSelect(methods) {
        const sel = document.getElementById('pcaRotation');
        if (!sel) return;
        sel.innerHTML = (methods || [])
            .map(function (m) {
                return (
                    '<option value="' +
                    App().escapeHtml(m.id) +
                    '"' +
                    (m.default ? ' selected' : '') +
                    '>' +
                    App().escapeHtml(m.label) +
                    (m.family === 'oblique' ? ' (oblicua)' : '') +
                    '</option>'
                );
            })
            .join('');
    }

    function renderRotationInfo(methods, title) {
        const body = document.getElementById('pcaRotationInfoBody');
        const titleEl = document.getElementById('pcaRotationInfoTitle');
        if (titleEl && title) titleEl.textContent = title;
        if (!body) return;
        body.innerHTML = (methods || [])
            .map(function (m) {
                return (
                    '<div class="analysis-avanz-rotation-card">' +
                    '<span class="family">' +
                    App().escapeHtml(m.family === 'oblique' ? 'Oblicua' : 'Ortogonal') +
                    '</span>' +
                    '<strong>' +
                    App().escapeHtml(m.label) +
                    (m.default ? ' (predeterminada)' : '') +
                    '</strong>' +
                    '<p>' +
                    App().escapeHtml(m.when || '') +
                    '</p></div>'
                );
            })
            .join('');
    }

    function toggleRotationInfo(show) {
        const panel = document.getElementById('pcaRotationInfo');
        if (panel) panel.hidden = !show;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            pcaSchema = null;
            return;
        }
        try {
            pcaSchema = await apiGet('/datasets/' + encodeURIComponent(id) + '/avanzado/pca/schema');
            renderVariables(pcaSchema.variables || []);
            fillRotationSelect(pcaSchema.rotation_methods || []);
            renderRotationInfo(
                pcaSchema.rotation_methods,
                pcaSchema.rotation_info_title || '¿Cuándo usar cada rotación?'
            );
            const btn = document.getElementById('pcaRunBtn');
            if (btn) btn.disabled = !pcaSchema.ready;
        } catch (err) {
            pcaSchema = null;
            console.warn('Esquema PCA:', err.message);
        }
    }

    function plotVariance(chartId, data) {
        if (!window.Plotly) return;
        const labels = (data.variance_explained || []).map(function (_, i) {
            return 'CP' + (i + 1);
        });
        const varPct = data.variance_explained || [];
        const cumPct = data.variance_cumulative || [];
        Plotly.newPlot(
            chartId,
            [
                {
                    type: 'bar',
                    x: labels,
                    y: varPct,
                    name: '% varianza',
                    marker: { color: '#7c3aed' }
                },
                {
                    type: 'scatter',
                    mode: 'lines+markers',
                    x: labels,
                    y: cumPct,
                    name: '% acumulada',
                    yaxis: 'y2',
                    line: { color: '#dc2626', width: 2 },
                    marker: { size: 8 }
                }
            ],
            {
                title: window.AnalysisPlotly
                    ? window.AnalysisPlotly.plotTitle('Varianza explicada por componente')
                    : 'Varianza explicada por componente',
                margin: { t: 145, b: 56, l: 56, r: 56 },
                yaxis: {
                    title: '% individual',
                    range: [0, Math.max(100, Math.max.apply(null, varPct.concat([0])) + 5)]
                },
                yaxis2: {
                    title: '% acumulada',
                    overlaying: 'y',
                    side: 'right',
                    range: [0, 100]
                },
                legend: window.AnalysisPlotly
                    ? window.AnalysisPlotly.legendBelowTitle({ font: { size: 11 } })
                    : { orientation: 'h', y: 1, yanchor: 'bottom' },
                height: 400
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function biplotAxisTitle(componentNum, variancePct) {
        const base = 'Componente ' + componentNum;
        if (variancePct == null || variancePct === '') {
            return base;
        }
        const n = Number(variancePct);
        if (isNaN(n)) {
            return base;
        }
        const pct = Math.round(n * 100) / 100;
        return base + ' (' + pct + '% de varianza explicada)';
    }

    const BIPLOT_COND_COLOR_FALLBACK = [
        '#2563eb',
        '#ca8a04',
        '#7c3aed',
        '#0891b2',
        '#64748b'
    ];

    function biplotCondicionColor(label, fallbackIndex) {
        const s = String(label || '')
            .trim()
            .toLowerCase();
        if (s.indexOf('normo') >= 0) {
            return '#16a34a';
        }
        if (s.indexOf('obes') >= 0) {
            return '#dc2626';
        }
        if (s.indexOf('sobre') >= 0) {
            return '#ea580c';
        }
        if (s.indexOf('bajo') >= 0) {
            return '#2563eb';
        }
        return BIPLOT_COND_COLOR_FALLBACK[fallbackIndex % BIPLOT_COND_COLOR_FALLBACK.length];
    }

    function plotBiplot(chartId, biplot, data) {
        if (!window.Plotly || !biplot) return;
        const scores = biplot.scores || [];
        const loads = biplot.loadings || [];
        const varPct = data.variance_explained || [];
        const stratLabel = biplot.stratify_label || 'Condición';
        const traces = [];
        const hasCond = scores.some(function (s) {
            return s.condicion != null && s.condicion !== '';
        });
        if (hasCond) {
            const byGroup = {};
            scores.forEach(function (s) {
                const g = s.condicion || 'Sin dato';
                if (!byGroup[g]) {
                    byGroup[g] = [];
                }
                byGroup[g].push(s);
            });
            const groups = biplot.condicion_groups || Object.keys(byGroup).sort();
            let fallbackIdx = 0;
            groups.forEach(function (g) {
                const pts = byGroup[g] || [];
                if (!pts.length) {
                    return;
                }
                const color = biplotCondicionColor(g, fallbackIdx);
                if (
                    String(g)
                        .toLowerCase()
                        .indexOf('normo') < 0 &&
                    String(g)
                        .toLowerCase()
                        .indexOf('obes') < 0 &&
                    String(g)
                        .toLowerCase()
                        .indexOf('sobre') < 0 &&
                    String(g)
                        .toLowerCase()
                        .indexOf('bajo') < 0
                ) {
                    fallbackIdx += 1;
                }
                traces.push({
                    type: 'scatter',
                    mode: 'markers',
                    x: pts.map(function (s) {
                        return s.pc1;
                    }),
                    y: pts.map(function (s) {
                        return s.pc2;
                    }),
                    name: g + ' (n=' + pts.length + ')',
                    marker: {
                        color: color,
                        size: 8,
                        opacity: 0.72,
                        line: { width: 0.6, color: '#fff' }
                    },
                    hovertemplate:
                        '<b>' +
                        App().escapeHtml(stratLabel) +
                        ': ' +
                        App().escapeHtml(g) +
                        '</b><br>CP1=%{x}<br>CP2=%{y}<extra></extra>'
                });
            });
        } else {
            traces.push({
                type: 'scatter',
                mode: 'markers',
                x: scores.map(function (s) {
                    return s.pc1;
                }),
                y: scores.map(function (s) {
                    return s.pc2;
                }),
                marker: { color: 'rgba(37,99,235,0.45)', size: 7 },
                name: 'Individuos',
                hoverinfo: 'skip'
            });
        }
        loads.forEach(function (l) {
            traces.push({
                type: 'scatter',
                mode: 'lines+text',
                x: [0, l.pc1],
                y: [0, l.pc2],
                line: { color: '#0f172a', width: 2 },
                text: ['', l.label],
                textposition: 'top center',
                textfont: { size: 11 },
                name: l.label,
                showlegend: false,
                hoverinfo: 'text',
                hovertext:
                    l.label +
                    '<br>CP1=' +
                    l.loading_pc1 +
                    ', CP2=' +
                    l.loading_pc2
            });
        });
        Plotly.newPlot(
            chartId,
            traces,
            {
                title: window.AnalysisPlotly
                    ? window.AnalysisPlotly.plotTitle(
                          'Biplot (CP1 vs CP2) — ' + (data.rotation_label || '')
                      )
                    : 'Biplot (CP1 vs CP2) — ' + (data.rotation_label || ''),
                xaxis: { title: biplotAxisTitle(1, varPct[0]), zeroline: true },
                yaxis: {
                    title: biplotAxisTitle(2, varPct[1]),
                    zeroline: true,
                    scaleanchor: 'x',
                    scaleratio: 1
                },
                margin: { t: hasCond ? 185 : 80, b: 52, l: 56, r: hasCond ? 32 : 24 },
                height: 460,
                showlegend: hasCond,
                legend: hasCond
                    ? window.AnalysisPlotly
                        ? window.AnalysisPlotly.legendBelowTitle({
                              font: { size: 10 },
                              tracegroupgap: 6
                          })
                        : { orientation: 'h', y: 1, yanchor: 'bottom', x: 0.5, xanchor: 'center', font: { size: 11 } }
                    : undefined
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    const LOADING_THRESHOLD = 0.4;

    function dominantPc(row, k) {
        let best = 0;
        let bestVal = 0;
        for (let j = 1; j <= k; j++) {
            const v = Math.abs(parseFloat(row['pc' + j]));
            if (!isNaN(v) && v > bestVal) {
                bestVal = v;
                best = j;
            }
        }
        return bestVal >= LOADING_THRESHOLD ? best : 0;
    }

    function formatLoadingValue(val) {
        if (val == null || val === '') return '—';
        const n = parseFloat(val);
        if (isNaN(n)) return String(val);
        const s = n >= 0 ? '+' + n.toFixed(3) : n.toFixed(3);
        return s;
    }

    function renderLoadingsTable(data) {
        const k = data.n_components || 2;
        const threshold = LOADING_THRESHOLD;
        let h =
            '<section class="analysis-avanz-loadings">' +
            '<p class="analysis-infer-table-title">Cargas rotadas (loadings)</p>' +
            '<p class="analysis-infer-stat-line analysis-avanz-loadings-note">' +
            'Son los <strong>loadings</strong> del modelo PCA tras la rotación elegida: indican qué tan ' +
            'fuerte se asocia cada variable con cada componente (valores entre −1 y 1). ' +
            'Se resaltan cargas con |valor| ≥ ' +
            threshold +
            ' (definen el agrupamiento en ese eje).</p>';

        h += '<div class="analysis-avanz-loadings-legend">';
        for (let j = 1; j <= k; j++) {
            h +=
                '<span class="analysis-avanz-loadings-legend-item pca-load-hl-pc' +
                j +
                '"><span class="swatch"></span> CP' +
                j +
                '</span>';
        }
        h += '</div>';

        h +=
            '<div class="analysis-table-wrap"><table class="analysis-data-table analysis-avanz-loadings-table"><thead><tr>' +
            '<th>Variable</th><th>Dominio</th>';
        for (let j = 1; j <= k; j++) {
            h += '<th>CP' + j + '</th>';
        }
        h += '</tr></thead><tbody>';

        (data.loadings || []).forEach(function (row) {
            const domPc = dominantPc(row, k);
            h += '<tr>';
            h +=
                '<th scope="row"' +
                (domPc ? ' class="pca-load-var-hl pca-load-hl-pc' + domPc + '"' : '') +
                '>' +
                App().escapeHtml(row.label || '—') +
                '</th>';
            h += '<td>' + App().escapeHtml(row.domain || '—') + '</td>';
            for (let j = 1; j <= k; j++) {
                const raw = row['pc' + j];
                const abs = Math.abs(parseFloat(raw));
                const hl = !isNaN(abs) && abs >= threshold;
                const cls = hl ? ' pca-load-hl-pc' + j : '';
                h +=
                    '<td class="' +
                    cls.trim() +
                    '">' +
                    App().escapeHtml(formatLoadingValue(raw)) +
                    '</td>';
            }
            h += '</tr>';
        });
        return h + '</tbody></table></div></section>';
    }

    function renderResults(data) {
        const mount = document.getElementById('pcaResultsMount');
        if (!mount) return;
        const varId = plotId('pcaVar');
        const biplotId = plotId('pcaBiplot');
        const insight = data.insight || {};

        let html =
            '<div class="analysis-infer-summary-vars"><strong>n=</strong>' +
            data.n +
            ' · <strong>Variables=</strong>' +
            data.n_variables +
            ' · <strong>Rotación:</strong> ' +
            App().escapeHtml(data.rotation_label) +
            ' · <strong>Componentes interpretados:</strong> ' +
            data.n_components +
            '</div>';
        html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(data.method_note || '') + '</p>';

        html += '<div class="analysis-avanz-insight"><h4>' + App().escapeHtml(insight.title || 'Insight') + '</h4>';
        (insight.paragraphs || []).forEach(function (p) {
            html += '<p>' + App().escapeHtml(p) + '</p>';
        });
        if (insight.separate_axes) {
            html +=
                '<p><strong>Patrón:</strong> ejes perinatal y metabólico relativamente separados.</p>';
        } else if (insight.mixed_axes) {
            html += '<p><strong>Patrón:</strong> dominios mezclados en al menos un componente.</p>';
        }
        html += '</div>';

        (data.component_insights || []).slice(0, 4).forEach(function (c) {
            html +=
                '<p class="analysis-infer-stat-line"><strong>CP' +
                c.pc +
                ':</strong> ' +
                App().escapeHtml(c.interpretation_hint || '') +
                '</p>';
        });

        html += '<div class="analysis-avanz-charts-row">';
        html += '<div id="' + varId + '" class="analysis-avanz-chart"></div>';
        html += '<div id="' + biplotId + '" class="analysis-avanz-chart"></div>';
        html += '</div>';

        html += renderLoadingsTable(data);
        if (data.biplot && data.biplot.condicion_groups && data.biplot.condicion_groups.length) {
            html +=
                '<p class="analysis-infer-stat-line">Biplot estratificado por <strong>' +
                App().escapeHtml(data.biplot.stratify_label || 'Condición') +
                '</strong>: ' +
                App().escapeHtml(data.biplot.condicion_groups.join(' · ')) +
                '.</p>';
        }
        if (data.biplot && data.biplot.scale_note) {
            html +=
                '<p class="analysis-infer-stat-line"><em>' +
                App().escapeHtml(data.biplot.scale_note) +
                '</em></p>';
        }

        mount.innerHTML = html;
        plotVariance(varId, data);
        plotBiplot(biplotId, data.biplot, data);
        showPcaStep('results');
    }

    async function runPca() {
        const rotation = document.getElementById('pcaRotation')?.value || 'varimax';
        const id = getDatasetId();
        if (!id) {
            App().showToast('Cargue una base de datos primero', 'info');
            return;
        }
        if (pcaSchema && !pcaSchema.ready) {
            App().showToast('No hay suficientes variables con datos para PCA', 'info');
            return;
        }

        App().showLoading('Calculando PCA...');
        try {
            const data = await apiPost('/datasets/' + encodeURIComponent(id) + '/avanzado/pca/run', {
                rotation: rotation
            });
            renderResults(data);
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('pcaRunBtn')?.addEventListener('click', runPca);
        document.getElementById('pcaBackBtn')?.addEventListener('click', resetPca);
        document.getElementById('pcaRotationInfoBtn')?.addEventListener('click', function () {
            toggleRotationInfo(true);
        });
        document.getElementById('pcaRotationInfoClose')?.addEventListener('click', function () {
            toggleRotationInfo(false);
        });
    }

    function init() {
        bindControls();
        resetPca();
        toggleRotationInfo(false);
    }

    function onSubmoduleShown() {
        loadSchema();
    }

    function onDatasetChanged() {
        resetPca();
        loadSchema();
    }

    window.AnalysisAvanzadoPca = {
        init: init,
        loadSchema: loadSchema,
        onSubmoduleShown: onSubmoduleShown,
        onDatasetChanged: onDatasetChanged
    };
})();
