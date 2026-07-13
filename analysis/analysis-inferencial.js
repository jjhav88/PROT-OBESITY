/**
 * Análisis inferencial — wizard: supuestos → elección de prueba → resultados.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let inferSchema = null;
    let lastAssumptions = null;
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
        const res = await fetch(API() + path);
        return parseResponse(res);
    }

    async function apiPost(path, body) {
        const res = await fetch(API() + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        return parseResponse(res);
    }

    function showNoData(show) {
        const empty = document.getElementById('analysisInferNoData');
        const content = document.getElementById('analysisInferContent');
        if (empty) empty.hidden = !show;
        if (content) content.hidden = show;
    }

    function activateInferSubmodule(submoduleId) {
        if (!submoduleId) return;
        document.querySelectorAll('.analysis-infer-subtab').forEach(function (tab) {
            const match = tab.getAttribute('data-infer-submodule') === submoduleId;
            tab.classList.toggle('active', match);
            tab.setAttribute('aria-selected', match ? 'true' : 'false');
        });
        document.querySelectorAll('.analysis-infer-submodule').forEach(function (panel) {
            const match = panel.getAttribute('data-infer-submodule') === submoduleId;
            panel.classList.toggle('active', match);
            panel.hidden = !match;
        });
        if (submoduleId === 'chisq' && window.AnalysisInferencialChisq) {
            window.AnalysisInferencialChisq.onSubmoduleShown();
        }
        if (submoduleId === 'regression' && window.AnalysisInferencialRegression) {
            window.AnalysisInferencialRegression.onSubmoduleShown();
        }
        if (submoduleId === 'anova') {
            const ancPanel = document.getElementById('inferAnovaPanelAncova');
            if (
                ancPanel &&
                !ancPanel.hidden &&
                window.AnalysisInferencialAncova &&
                window.AnalysisInferencialAncova.onPanelShown
            ) {
                window.AnalysisInferencialAncova.onPanelShown();
            }
        }
    }

    function initAnovaInnerTabs() {
        const tabs = document.querySelectorAll('[data-anova-panel]');
        const panelGroups = document.getElementById('inferAnovaPanelGroups');
        const panelAncova = document.getElementById('inferAnovaPanelAncova');
        if (!tabs.length || !panelGroups || !panelAncova) return;

        function activate(panelId) {
            tabs.forEach(function (tab) {
                const match = tab.getAttribute('data-anova-panel') === panelId;
                tab.classList.toggle('active', match);
                tab.setAttribute('aria-selected', match ? 'true' : 'false');
            });
            const isGroups = panelId === 'groups';
            panelGroups.classList.toggle('active', isGroups);
            panelGroups.hidden = !isGroups;
            panelAncova.classList.toggle('active', !isGroups);
            panelAncova.hidden = isGroups;
            if (!isGroups && window.AnalysisInferencialAncova && window.AnalysisInferencialAncova.onPanelShown) {
                window.AnalysisInferencialAncova.onPanelShown();
            }
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                activate(tab.getAttribute('data-anova-panel') || 'groups');
            });
        });
    }

    function initInferSubmodules() {
        document.querySelectorAll('.analysis-infer-subtab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateInferSubmodule(tab.getAttribute('data-infer-submodule'));
            });
        });
        const active = document.querySelector('.analysis-infer-subtab.active');
        activateInferSubmodule(
            active ? active.getAttribute('data-infer-submodule') : 'anova'
        );
    }

    function showStep(step) {
        ['inferStepSetup', 'inferStepAssumptions', 'inferStepTest'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== step;
        });
    }

    function resetWizard() {
        lastAssumptions = null;
        showStep('inferStepSetup');
        const confirm = document.getElementById('inferAssumptionsConfirm');
        const nextBtn = document.getElementById('inferNextToTest');
        if (confirm) confirm.checked = false;
        if (nextBtn) nextBtn.disabled = true;
        document.getElementById('inferAssumptionsMount').innerHTML = '';
        document.getElementById('inferTestMount').innerHTML = '';
    }

    function fillSelect(sel, options, valueKey, labelKey) {
        if (!sel) return;
        sel.innerHTML =
            '<option value="">— Seleccione —</option>' +
            options
                .map(function (o) {
                    const v = o[valueKey];
                    const lbl = o[labelKey] || v;
                    const derived = o.derived ? ' (calculada)' : '';
                    return (
                        '<option value="' +
                        App().escapeHtml(String(v)) +
                        '">' +
                        App().escapeHtml(String(lbl) + derived) +
                        '</option>'
                    );
                })
                .join('');
    }

    function renderSuggestedProfile(mountId, profile, numericVars) {
        const mount = document.getElementById(mountId);
        if (!mount || !profile) return;
        const vars = numericVars || [];
        const entries =
            profile.variables ||
            (profile.variable_ids || []).map(function (vid) {
                return { id: vid, label: vid };
            });
        mount.innerHTML =
            '<h4>' +
            App().escapeHtml(profile.title) +
            '</h4><p>' +
            App().escapeHtml(profile.description) +
            '</p><ul>' +
            entries
                .map(function (entry) {
                    const label = entry.label || entry.id || '—';
                    const tag = entry.derived ? ' <em>(calculada)</em>' : '';
                    const state =
                        entry.available === false
                            ? ' <span class="analysis-infer-profile-missing">(no en la base)</span>'
                            : '';
                    return '<li>' + App().escapeHtml(label) + tag + state + '</li>';
                })
                .join('') +
            '</ul>';
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            inferSchema = null;
            showNoData(true);
            return;
        }
        showNoData(false);
        try {
            inferSchema = await apiGet('/datasets/' + encodeURIComponent(id) + '/inferencial/schema');
            fillSelect(
                document.getElementById('inferFactor'),
                inferSchema.categorical_variables || [],
                'column',
                'label'
            );
            fillSelect(
                document.getElementById('inferDependent'),
                inferSchema.numeric_variables || [],
                'id',
                'label'
            );
            renderSuggestedProfile(
                'inferLipidProfile',
                inferSchema.lipid_profile,
                inferSchema.numeric_variables
            );
            renderSuggestedProfile(
                'inferAnthroProfile',
                inferSchema.anthropometric_profile,
                inferSchema.numeric_variables
            );
        } catch (err) {
            inferSchema = null;
            console.warn('Esquema inferencial:', err.message);
        }
    }

    function plotlyConfig(overrides) {
        return window.AnalysisPlotly
            ? window.AnalysisPlotly.config(overrides)
            : { responsive: true, displayModeBar: 'hover' };
    }

    function formatP(p) {
        if (p == null || p === '') return '—';
        if (typeof p === 'number' && p < 0.001) return '<0.001';
        return String(p);
    }

    function plotHistogram(containerId, values, title) {
        if (!window.Plotly || !values || !values.length) return;
        Plotly.newPlot(
            containerId,
            [
                {
                    type: 'histogram',
                    x: values,
                    marker: { color: '#2563eb', opacity: 0.75 },
                    name: 'Residuos'
                }
            ],
            {
                title: title || 'Histograma de residuos',
                margin: { t: 40, b: 44, l: 48, r: 16 },
                xaxis: { title: 'Residuos' },
                yaxis: { title: 'Frecuencia' },
                height: 260
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function plotQQ(containerId, qq) {
        if (!window.Plotly || !qq || !qq.sample || !qq.sample.length) return;
        const theoretical = qq.theoretical || [];
        const sample = qq.sample || [];
        const traces = [
            {
                type: 'scatter',
                mode: 'markers',
                x: theoretical.length ? theoretical : sample,
                y: sample,
                marker: { color: '#2563eb', size: 7 },
                name: 'Residuos'
            }
        ];
        let refX;
        let refY;
        const ref = qq.reference_line;
        if (ref && ref.x && ref.y && ref.x.length >= 2) {
            refX = ref.x;
            refY = ref.y;
        } else if (theoretical.length) {
            const all = theoretical.concat(sample);
            const lo = Math.min.apply(null, all);
            const hi = Math.max.apply(null, all);
            refX = [lo, hi];
            refY = [lo, hi];
        }
        if (refX && refY) {
            traces.push({
                type: 'scatter',
                mode: 'lines',
                x: refX,
                y: refY,
                line: { color: '#dc2626', width: 2, dash: 'dash' },
                name: 'Referencia normal (45°)',
                hoverinfo: 'skip'
            });
        }
        let axisLo;
        let axisHi;
        if (qq.axis_range && qq.axis_range.length === 2) {
            axisLo = qq.axis_range[0];
            axisHi = qq.axis_range[1];
        } else {
            const all = theoretical.length ? theoretical.concat(sample) : sample;
            axisLo = Math.min.apply(null, all);
            axisHi = Math.max.apply(null, all);
            const pad = Math.max((axisHi - axisLo) * 0.05, 0.15);
            axisLo -= pad;
            axisHi += pad;
        }
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: 'Gráfico Q-Q (residuos estandarizados)',
                margin: { t: 40, b: 44, l: 48, r: 16 },
                xaxis: {
                    title: 'Cuantiles teóricos N(0,1)',
                    range: [axisLo, axisHi],
                    zeroline: true,
                    zerolinecolor: '#e2e8f0'
                },
                yaxis: {
                    title: 'Cuantiles muestrales (estandarizados)',
                    range: [axisLo, axisHi],
                    scaleanchor: 'x',
                    scaleratio: 1,
                    zeroline: true,
                    zerolinecolor: '#e2e8f0'
                },
                height: 280,
                showlegend: false
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function renderAssumptions(data) {
        const mount = document.getElementById('inferAssumptionsMount');
        if (!mount) return;
        const n = data.normality || {};
        const l = data.homogeneity || {};
        const rec = data.recommendation || {};
        const histId = plotId('inferHist');
        const qqId = plotId('inferQQ');

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Factor:</strong> ' +
            App().escapeHtml(data.factor_column) +
            ' · <strong>Dependiente:</strong> ' +
            App().escapeHtml(data.dependent_label) +
            '</div>';

        html += '<div class="analysis-infer-assumption-grid">';
        html += '<div class="analysis-infer-card"><h5>Normalidad (residuos del ANOVA)</h5>';
        html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(n.note || '') + '</p>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>Asimetría:</strong> ' +
            formatP(n.skewness) +
            ' · <strong>Curtosis (Fisher):</strong> ' +
            formatP(n.kurtosis) +
            '</p>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(n.test || '') +
            ':</strong> estadístico=' +
            formatP(n.statistic) +
            ', p=' +
            formatP(n.p_value) +
            ' → ' +
            (n.normal ? 'compatible con normalidad' : 'no normal') +
            '</p>';
        html += '<div id="' + histId + '" class="analysis-infer-chart"></div>';
        html += '<div id="' + qqId + '" class="analysis-infer-chart"></div>';
        html += '</div>';

        html += '<div class="analysis-infer-card"><h5>Homocedasticidad</h5>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(l.test || 'Levene') +
            ':</strong> estadístico=' +
            formatP(l.statistic) +
            ', p=' +
            formatP(l.p_value) +
            ' → ' +
            (l.homogeneous ? 'varianzas homogéneas' : 'heterocedasticidad') +
            '</p>';
        html += '<p class="analysis-infer-stat-line"><strong>Grupos:</strong></p><ul>';
        (data.groups || []).forEach(function (g) {
            html +=
                '<li>' +
                App().escapeHtml(g.label) +
                ': n=' +
                g.n +
                ', media=' +
                g.mean +
                ', DE=' +
                g.sd +
                '</li>';
        });
        html += '</ul></div></div>';

        html +=
            '<div class="analysis-infer-decision"><p><strong>Sugerencia automática:</strong> ' +
            App().escapeHtml(rec.label || '') +
            ' — ' +
            App().escapeHtml(rec.reason || '') +
            '</p></div>';

        mount.innerHTML = html;

        plotHistogram(histId, n.histogram_values || [], 'Histograma de residuos');
        plotQQ(qqId, n.qqplot || {});

        const method = rec.method || 'anova';
        const radio = document.querySelector('input[name="inferMethod"][value="' + method + '"]');
        if (radio) radio.checked = true;
        updateNextButtonState();
    }

    function updateNextButtonState() {
        const confirm = document.getElementById('inferAssumptionsConfirm');
        const nextBtn = document.getElementById('inferNextToTest');
        const method = document.querySelector('input[name="inferMethod"]:checked');
        if (nextBtn) {
            nextBtn.disabled = !(confirm && confirm.checked && method);
        }
    }

    async function verifyAssumptions() {
        const factor = document.getElementById('inferFactor')?.value;
        const dependent = document.getElementById('inferDependent')?.value;
        if (!factor || !dependent) {
            App().showToast('Seleccione la variable factor y la variable dependiente', 'info');
            return;
        }
        const id = getDatasetId();
        if (!id) return;

        App().showLoading('Verificando supuestos...');
        try {
            lastAssumptions = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/assumptions',
                { factor_column: factor, dependent_id: dependent }
            );
            renderAssumptions(lastAssumptions);
            showStep('inferStepAssumptions');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function renderTable(title, rows, columns) {
        if (!rows || !rows.length) return '';
        let h =
            '<p class="analysis-infer-table-title">' +
            App().escapeHtml(title) +
            '</p><div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr>';
        columns.forEach(function (c) {
            h += '<th>' + App().escapeHtml(c.label) + '</th>';
        });
        h += '</tr></thead><tbody>';
        rows.forEach(function (row) {
            h += '<tr>';
            columns.forEach(function (c) {
                let val = row[c.key];
                if (c.key === 'significant') val = val ? 'Sí' : 'No';
                h += '<td>' + App().escapeHtml(val == null ? '—' : String(val)) + '</td>';
            });
            h += '</tr>';
        });
        return h + '</tbody></table></div>';
    }

    function plotBoxplot(containerId, data) {
        if (!window.Plotly || !data?.boxplot?.groups) return;
        const groups = data.boxplot.groups;
        const labels = groups.map(function (g) {
            return g.label;
        });
        const traces = groups.map(function (g, i) {
            return {
                type: 'box',
                name: g.label,
                y: g.values || [],
                x: (g.values || []).map(function () {
                    return g.label;
                }),
                boxpoints: 'all',
                jitter: 0.35,
                marker: { size: 7 },
                fillcolor: ['rgba(37,99,235,0.12)', 'rgba(234,179,8,0.14)', 'rgba(220,38,38,0.14)'][i % 3],
                showlegend: false
            };
        });
        const sig = (data.posthoc?.rows || []).filter(function (r) {
            return r.significant;
        });
        const allY = groups.flatMap(function (g) {
            return g.values || [];
        });
        const yMax = allY.length ? Math.max.apply(null, allY) : 1;
        const yMin = allY.length ? Math.min.apply(null, allY) : 0;
        const span = Math.max(yMax - yMin, 1e-6);
        const shapes = [];
        const annotations = [];
        sig.forEach(function (p, level) {
            const yLine = yMax + span * (0.1 + level * 0.11);
            shapes.push(
                { type: 'line', xref: 'x', yref: 'y', x0: p.g1, x1: p.g2, y0: yLine, y1: yLine, line: { color: '#0f172a', width: 1.2 } },
                { type: 'line', xref: 'x', yref: 'y', x0: p.g1, x1: p.g1, y0: yLine - span * 0.015, y1: yLine, line: { color: '#0f172a', width: 1.2 } },
                { type: 'line', xref: 'x', yref: 'y', x0: p.g2, x1: p.g2, y0: yLine - span * 0.015, y1: yLine, line: { color: '#0f172a', width: 1.2 } }
            );
            annotations.push({
                x: p.g2,
                y: yLine + span * 0.02,
                text: 'p=' + formatP(p.p_adj),
                showarrow: false,
                xref: 'x',
                yref: 'y',
                xanchor: 'center',
                font: { size: 11 }
            });
        });
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: data.dependent_label + ' por grupo',
                xaxis: { title: data.factor_column, categoryorder: 'array', categoryarray: labels },
                yaxis: { title: data.dependent_label },
                shapes: shapes,
                annotations: annotations,
                margin: { t: 48, r: 20, b: 56, l: 56 },
                height: Math.max(400, 360 + sig.length * 28)
            },
            plotlyConfig()
        );
    }

    function backToVariableSelection() {
        showStep('inferStepSetup');
    }

    function renderEffectSize(es) {
        if (!es) return '';
        const ranges = es.interpretation_ranges || [];
        let html =
            '<section class="analysis-infer-effect">' +
            '<h4 class="analysis-infer-table-title">Tamaño del efecto</h4>';
        if (es.note) {
            html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(es.note) + '</p>';
        }
        html +=
            '<div class="analysis-table-wrap"><table class="analysis-data-table analysis-infer-effect-table">' +
            '<thead><tr><th>Medida</th><th>Valor</th><th>' +
            App().escapeHtml(
                (es.ci && es.ci.label) || (es.table && es.table.ci_label) || 'IC 95%'
            ) +
            '</th><th>Interpretación</th></tr></thead><tbody><tr>' +
            '<td>' +
            App().escapeHtml((es.table && es.table.measure) || es.name || '—') +
            '</td><td>' +
            App().escapeHtml((es.table && es.table.value) || es.value_display || '—') +
            '</td><td>' +
            App().escapeHtml(
                (es.table && es.table.ci) || (es.ci && es.ci.display) || '—'
            ) +
            '</td><td>' +
            App().escapeHtml((es.table && es.table.interpretation) || es.interpretation || '—') +
            '</td></tr></tbody></table></div>';
        html += '<aside class="analysis-infer-effect-ranges" aria-label="Rangos de interpretación">';
        html += '<h5>Rangos de interpretación</h5><ul>';
        ranges.forEach(function (r) {
            html +=
                '<li><strong>' +
                App().escapeHtml(r.label) +
                ':</strong> ' +
                App().escapeHtml(r.range) +
                '</li>';
        });
        html += '</ul>';
        if (es.interpretation) {
            html +=
                '<p class="analysis-infer-effect-verdict"><strong>En este análisis:</strong> ' +
                App().escapeHtml(es.interpretation) +
                '</p>';
        }
        html += '</aside></section>';
        return html;
    }

    function renderTestResults(data) {
        const mount = document.getElementById('inferTestMount');
        if (!mount) return;
        const gt = data.global_table || {};
        const ph = data.posthoc || {};
        const boxId = plotId('inferBox');

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Factor:</strong> ' +
            App().escapeHtml(data.factor_column) +
            ' · <strong>Dependiente:</strong> ' +
            App().escapeHtml(data.dependent_label) +
            ' · <strong>Prueba:</strong> ' +
            App().escapeHtml(data.method_label) +
            ' (p global=' +
            formatP(gt.p_value) +
            ')</div>';

        if (data.method === 'anova') {
            html += renderTable('Tabla ANOVA (estilo R)', gt.rows || [], [
                { key: 'source', label: '' },
                { key: 'df', label: 'Df' },
                { key: 'sum_sq', label: 'Sum Sq' },
                { key: 'mean_sq', label: 'Mean Sq' },
                { key: 'F', label: 'F value' },
                { key: 'p', label: 'Pr(>F)' }
            ]);
        } else if (data.method === 'welch') {
            html += renderTable('Tabla ANOVA de Welch', gt.rows || [], [
                { key: 'source', label: '' },
                { key: 'df1', label: 'Df1' },
                { key: 'df2', label: 'Df2' },
                { key: 'F', label: 'F' },
                { key: 'p', label: 'Pr(>F)' }
            ]);
        } else {
            html += renderTable('Tabla Kruskal-Wallis', gt.rows || [], [
                { key: 'source', label: '' },
                { key: 'df', label: 'Df' },
                { key: 'chi_sq', label: 'Chi-sq' },
                { key: 'p', label: 'Pr(>F)' }
            ]);
        }

        html +=
            '<p class="analysis-infer-stat-line"><strong>Post-hoc:</strong> ' +
            App().escapeHtml(ph.test || '') +
            ' · <strong>Corrección:</strong> ' +
            App().escapeHtml(ph.correction || '—') +
            '</p>';

        html += renderTable('Comparaciones pareadas', ph.rows || [], [
            { key: 'g1', label: 'Grupo 1' },
            { key: 'g2', label: 'Grupo 2' },
            { key: 'diff', label: 'Diferencia' },
            { key: 'p_adj', label: 'p ajustado' },
            { key: 'significant', label: 'Signif.' }
        ]);

        html += '<div id="' + boxId + '" class="analysis-chart analysis-chart-infer-box"></div>';
        html += renderEffectSize(data.effect_size);
        mount.innerHTML = html;
        plotBoxplot(boxId, data);
    }

    async function runSelectedTest() {
        const factor = document.getElementById('inferFactor')?.value;
        const dependent = document.getElementById('inferDependent')?.value;
        const methodEl = document.querySelector('input[name="inferMethod"]:checked');
        if (!factor || !dependent || !methodEl) {
            App().showToast('Complete la selección y la declaración de supuestos', 'info');
            return;
        }
        const id = getDatasetId();
        if (!id) return;

        App().showLoading('Ejecutando prueba y post-hoc...');
        try {
            const data = await apiPost('/datasets/' + encodeURIComponent(id) + '/inferencial/run-test', {
                factor_column: factor,
                dependent_id: dependent,
                method: methodEl.value
            });
            renderTestResults(data);
            showStep('inferStepTest');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('inferVerifyAssumptions')?.addEventListener('click', verifyAssumptions);
        document.getElementById('inferNextToTest')?.addEventListener('click', runSelectedTest);
        document.getElementById('inferBackFromAssumptions')?.addEventListener('click', backToVariableSelection);
        document.getElementById('inferBackToSetup')?.addEventListener('click', resetWizard);
        document.getElementById('inferAssumptionsConfirm')?.addEventListener('change', updateNextButtonState);
        document.querySelectorAll('input[name="inferMethod"]').forEach(function (r) {
            r.addEventListener('change', updateNextButtonState);
        });
        document.getElementById('tabPrelimInferencial')?.addEventListener('click', function () {
            if (getDatasetId()) loadSchema();
        });
    }

    function init() {
        bindControls();
        initInferSubmodules();
        initAnovaInnerTabs();
        resetWizard();
        if (window.AnalysisInferencialChisq && window.AnalysisInferencialChisq.init) {
            window.AnalysisInferencialChisq.init();
        }
        if (window.AnalysisInferencialRegression && window.AnalysisInferencialRegression.init) {
            window.AnalysisInferencialRegression.init();
        }
        if (window.AnalysisInferencialAncova && window.AnalysisInferencialAncova.init) {
            window.AnalysisInferencialAncova.init();
        }
        if (getDatasetId()) loadSchema();
        else showNoData(true);
    }

    function onDatasetChanged() {
        resetWizard();
        loadSchema();
        if (window.AnalysisInferencialChisq && window.AnalysisInferencialChisq.onDatasetChanged) {
            window.AnalysisInferencialChisq.onDatasetChanged();
        }
        if (window.AnalysisInferencialRegression && window.AnalysisInferencialRegression.onDatasetChanged) {
            window.AnalysisInferencialRegression.onDatasetChanged();
        }
        if (window.AnalysisInferencialAncova && window.AnalysisInferencialAncova.onDatasetChanged) {
            window.AnalysisInferencialAncova.onDatasetChanged();
        }
    }

    window.AnalysisInferencial = {
        init: init,
        onDatasetChanged: onDatasetChanged
    };
})();
