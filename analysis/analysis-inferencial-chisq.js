/**
 * Chi-cuadrado / Fisher y t / Mann-Whitney.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let chisqSchema = null;
    let plotCounter = 0;

    const ASSOC_STEPS = ['chisqAssocStepSetup', 'chisqAssocStepAssumptions', 'chisqAssocStepTest'];
    const CONT_STEPS = ['chisqContStepSetup', 'chisqContStepAssumptions', 'chisqContStepTest'];

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

    function fillSelect(sel, options, valueKey, labelKey) {
        if (!sel) return;
        sel.innerHTML =
            '<option value="">— Seleccione —</option>' +
            (options || [])
                .filter(function (o) {
                    return o.available !== false;
                })
                .map(function (o) {
                    const v = o[valueKey];
                    const lbl = o[labelKey] || v;
                    const title = o.description ? ' title="' + App().escapeHtml(o.description) + '"' : '';
                    return (
                        '<option value="' +
                        App().escapeHtml(String(v)) +
                        '"' +
                        title +
                        '>' +
                        App().escapeHtml(String(lbl)) +
                        '</option>'
                    );
                })
                .join('');
    }

    function getContOutcomeSpec(outcomeId) {
        return (chisqSchema?.continuous?.outcomes || []).find(function (o) {
            return o.id === outcomeId;
        });
    }

    function syncContGroupPairUI() {
        const oid = document.getElementById('chisqContOutcome')?.value;
        const pair = document.getElementById('chisqContGroupPair');
        const out = getContOutcomeSpec(oid);
        if (!pair) return;
        if (out && out.needs_group_pair && out.categories && out.categories.length) {
            pair.hidden = false;
            const opts = out.categories.map(function (c) {
                return { id: c, label: c, available: true };
            });
            fillSelect(document.getElementById('chisqContGroupA'), opts, 'id', 'label');
            fillSelect(document.getElementById('chisqContGroupB'), opts, 'id', 'label');
        } else {
            pair.hidden = true;
            const ga = document.getElementById('chisqContGroupA');
            const gb = document.getElementById('chisqContGroupB');
            if (ga) ga.innerHTML = '<option value="">— Seleccione —</option>';
            if (gb) gb.innerHTML = '<option value="">— Seleccione —</option>';
        }
    }

    function buildContRequestBody(pid, oid, extra) {
        const body = Object.assign({ predictor_id: pid, outcome_id: oid }, extra || {});
        const out = getContOutcomeSpec(oid);
        if (out && out.needs_group_pair) {
            const ga = document.getElementById('chisqContGroupA')?.value;
            const gb = document.getElementById('chisqContGroupB')?.value;
            if (!ga || !gb) return null;
            if (ga === gb) return null;
            body.group_a = ga;
            body.group_b = gb;
        }
        return body;
    }

    function renderRTestTable(testTable, conclusion) {
        let html = '';
        if (testTable && testTable.rows && testTable.rows.length) {
            html +=
                '<p class="analysis-infer-table-title">Salida de la prueba</p>' +
                '<div class="analysis-table-wrap"><table class="analysis-data-table analysis-infer-r-test">' +
                '<thead><tr><th></th><th>Valor</th></tr></thead><tbody>';
            testTable.rows.forEach(function (row) {
                html +=
                    '<tr><th>' +
                    App().escapeHtml(row.term) +
                    '</th><td>' +
                    App().escapeHtml(row.value == null ? '—' : String(row.value)) +
                    '</td></tr>';
            });
            html += '</tbody></table></div>';
            if (testTable.note) {
                html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(testTable.note) + '</p>';
            }
        }
        if (conclusion && conclusion.text) {
            const cls = conclusion.significant
                ? 'analysis-infer-conclusion analysis-infer-conclusion--sig'
                : 'analysis-infer-conclusion analysis-infer-conclusion--ns';
            html +=
                '<p class="' +
                cls +
                '"><strong>Interpretación (α=0,05):</strong> ' +
                App().escapeHtml(conclusion.text) +
                '</p>';
        }
        return html;
    }

    function showAssocStep(step) {
        ASSOC_STEPS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== step;
        });
    }

    function showContStep(step) {
        CONT_STEPS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== step;
        });
    }

    function resetAssocWizard() {
        showAssocStep('chisqAssocStepSetup');
        const c = document.getElementById('chisqAssocAssumptionsConfirm');
        const n = document.getElementById('chisqAssocNextToTest');
        if (c) c.checked = false;
        if (n) n.disabled = true;
        const m = document.getElementById('chisqAssocAssumptionsMount');
        const t = document.getElementById('chisqAssocTestMount');
        if (m) m.innerHTML = '';
        if (t) t.innerHTML = '';
    }

    function resetContWizard() {
        showContStep('chisqContStepSetup');
        const c = document.getElementById('chisqContAssumptionsConfirm');
        const n = document.getElementById('chisqContNextToTest');
        if (c) c.checked = false;
        if (n) n.disabled = true;
        const m = document.getElementById('chisqContAssumptionsMount');
        const t = document.getElementById('chisqContTestMount');
        if (m) m.innerHTML = '';
        if (t) t.innerHTML = '';
        syncContGroupPairUI();
    }

    function activateChisqSection(sectionId) {
        document.querySelectorAll('.analysis-infer-section-tab').forEach(function (tab) {
            const match = tab.getAttribute('data-chisq-section') === sectionId;
            tab.classList.toggle('active', match);
            tab.setAttribute('aria-selected', match ? 'true' : 'false');
        });
        document.querySelectorAll('.analysis-infer-section-panel').forEach(function (panel) {
            const match = panel.getAttribute('data-chisq-section') === sectionId;
            panel.classList.toggle('active', match);
            panel.hidden = !match;
        });
    }

    function renderAssocProfile(assoc) {
        const mount = document.getElementById('chisqAssocProfile');
        if (!mount || !assoc) return;
        const preds = (assoc.predictors || []).filter(function (p) {
            return p.available;
        });
        mount.innerHTML =
            '<h4>Variables perinatales sugeridas</h4><p>' +
            App().escapeHtml(assoc.insight || '') +
            '</p><ul>' +
            (assoc.predictors || [])
                .map(function (p) {
                    const state =
                        p.available === false
                            ? ' <span class="analysis-infer-profile-missing">(no en la base)</span>'
                            : '';
                    const desc = p.description ? ' — ' + p.description : '';
                    return (
                        '<li>' +
                        App().escapeHtml(p.label + desc) +
                        state +
                        '</li>'
                    );
                })
                .join('') +
            '</ul>' +
            (preds.length
                ? ''
                : '<p class="analysis-infer-stat-line">No hay predictores disponibles con datos suficientes.</p>');
    }

    function renderMatrixTable(title, matrix) {
        if (!matrix || !matrix.row_labels) return '';
        let h =
            '<p class="analysis-infer-table-title">' +
            App().escapeHtml(title) +
            '</p><div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th></th>';
        matrix.col_labels.forEach(function (c) {
            h += '<th>' + App().escapeHtml(c) + '</th>';
        });
        h += '</tr></thead><tbody>';
        matrix.row_labels.forEach(function (row, i) {
            h += '<tr><th>' + App().escapeHtml(row) + '</th>';
            (matrix.values[i] || []).forEach(function (v) {
                h += '<td>' + App().escapeHtml(String(v)) + '</td>';
            });
            h += '</tr>';
        });
        return h + '</tbody></table></' + 'div>';
    }

    function renderEffectSize(es) {
        if (!es) return '';
        const ranges = es.interpretation_ranges || [];
        let html =
            '<section class="analysis-infer-effect"><h4 class="analysis-infer-table-title">Tamaño del efecto</h4>';
        if (es.note) {
            html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(es.note) + '</p>';
        }
        html +=
            '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>Medida</th><th>Valor</th><th>' +
            App().escapeHtml(
                (es.ci && es.ci.label) || (es.table && es.table.ci_label) || 'IC 95%'
            ) +
            '</th><th>Interpretación</th></tr></thead><tbody><tr>' +
            '<td>' +
            App().escapeHtml(
                (es.table && es.table.measure) ||
                    (es.name || '') + ' (' + (es.symbol || '') + ')'
            ) +
            '</td><td>' +
            App().escapeHtml(es.value_display != null ? String(es.value_display) : '—') +
            '</td><td>' +
            App().escapeHtml(
                (es.table && es.table.ci) || (es.ci && es.ci.display) || '—'
            ) +
            '</td><td>' +
            App().escapeHtml(es.interpretation || '—') +
            '</td></tr></tbody></table></div>';
        if (ranges.length) {
            html += '<aside class="analysis-infer-effect-ranges"><h5>Rangos de interpretación</h5><ul>';
            ranges.forEach(function (r) {
                html +=
                    '<li><strong>' +
                    App().escapeHtml(r.label) +
                    ':</strong> ' +
                    App().escapeHtml(r.range) +
                    '</li>';
            });
            html += '</ul></aside>';
        }
        return html + '</section>';
    }

    function plotGroupedBar(containerId, chart) {
        if (!window.Plotly || !chart || !chart.series) return;
        const traces = chart.series.map(function (s, i) {
            return {
                type: 'bar',
                name: s.name,
                x: chart.x_labels,
                y: s.values,
                marker: {
                    color: ['#2563eb', '#eab308', '#dc2626', '#16a34a'][i % 4],
                    opacity: 0.85
                }
            };
        });
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: 'Frecuencias observadas',
                barmode: 'group',
                xaxis: { title: 'Categoría perinatal' },
                yaxis: { title: 'Frecuencia' },
                margin: { t: 44, b: 56, l: 48, r: 16 },
                height: 360,
                legend: { orientation: 'h', y: -0.2 }
            },
            plotlyConfig()
        );
    }

    function plotContBoxplot(containerId, chart) {
        if (!window.Plotly || !chart || !chart.groups) return;
        const traces = chart.groups.map(function (g, i) {
            return {
                type: 'box',
                name: g.label,
                y: g.values || [],
                boxpoints: 'all',
                jitter: 0.35,
                marker: { size: 6 },
                fillcolor: ['rgba(37,99,235,0.12)', 'rgba(234,179,8,0.14)'][i % 2],
                showlegend: true
            };
        });
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: 'Distribución por grupo de condición',
                yaxis: { title: 'Valor' },
                margin: { t: 44, b: 48, l: 56, r: 16 },
                height: 380
            },
            plotlyConfig()
        );
    }

    function updateAssocNext() {
        const confirm = document.getElementById('chisqAssocAssumptionsConfirm');
        const nextBtn = document.getElementById('chisqAssocNextToTest');
        const methodEl = document.querySelector('input[name="chisqAssocMethod"]:checked');
        if (nextBtn) nextBtn.disabled = !(confirm && confirm.checked && methodEl);
    }

    function updateContNext() {
        const confirm = document.getElementById('chisqContAssumptionsConfirm');
        const nextBtn = document.getElementById('chisqContNextToTest');
        const methodEl = document.querySelector('input[name="chisqContMethod"]:checked');
        if (nextBtn) nextBtn.disabled = !(confirm && confirm.checked && methodEl);
    }

    function renderAssocAssumptions(data) {
        const mount = document.getElementById('chisqAssocAssumptionsMount');
        if (!mount) return;
        const a = data.assumptions || {};
        const rec = data.recommendation || {};
        let html =
            '<div class="analysis-infer-summary-vars"><strong>Predictor:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Respuesta:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            '</div>';
        html += renderMatrixTable('Tabla de contingencia observada', data.observed);
        html +=
            '<div class="analysis-infer-card" style="margin-top:16px"><h5>Supuestos (frecuencias esperadas)</h5>' +
            '<p class="analysis-infer-stat-line"><strong>n:</strong> ' +
            App().escapeHtml(String(a.n)) +
            ' · <strong>Dimensiones:</strong> ' +
            App().escapeHtml(a.dimensions || '—') +
            '</p>' +
            '<p class="analysis-infer-stat-line"><strong>Celdas con esperado &lt; 5:</strong> ' +
            App().escapeHtml(String(a.cells_expected_lt5)) +
            ' (' +
            App().escapeHtml(String(a.pct_expected_lt5)) +
            '%)</p>' +
            '<p class="analysis-infer-stat-line"><strong>Mínimo esperado:</strong> ' +
            App().escapeHtml(String(a.min_expected)) +
            '</p></div>';
        html +=
            '<div class="analysis-infer-decision" style="margin-top:16px"><p><strong>Sugerencia automática:</strong> ' +
            App().escapeHtml(rec.label || '') +
            ' — ' +
            App().escapeHtml(rec.reason || '') +
            '</p></div>';
        mount.innerHTML = html;
        const method = rec.method;
        if (method) {
            const radio = document.querySelector('input[name="chisqAssocMethod"][value="' + method + '"]');
            if (radio) radio.checked = true;
        }
        updateAssocNext();
    }

    function renderAssocResults(data) {
        const mount = document.getElementById('chisqAssocTestMount');
        if (!mount) return;
        const chartId = plotId('chisqAssocBar');
        let html =
            '<div class="analysis-infer-summary-vars"><strong>Predictor:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Respuesta:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            ' · <strong>Prueba:</strong> ' +
            App().escapeHtml(data.method_label) +
            ' (p=' +
            formatP(data.p_value) +
            ')</' + 'div>';
        html += renderRTestTable(data.test_table_r, data.conclusion);
        html += renderMatrixTable('Frecuencias observadas', data.observed);
        html += renderMatrixTable('Frecuencias esperadas', data.expected);
        html += '<div id="' + chartId + '" class="analysis-chart analysis-chart-infer-box"></div>';
        html += renderEffectSize(data.effect_size);
        mount.innerHTML = html;
        plotGroupedBar(chartId, data.chart);
    }

    function renderContAssumptions(data) {
        const mount = document.getElementById('chisqContAssumptionsMount');
        if (!mount) return;
        const rec = data.recommendation || {};
        const n1 = data.normality_g1 || {};
        const n2 = data.normality_g2 || {};
        const lev = data.homogeneity || {};
        let html =
            '<div class="analysis-infer-summary-vars"><strong>Variable:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Grupos:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            '</div>';
        html += '<div class="analysis-infer-assumption-grid">';
        (data.groups || []).forEach(function (g, idx) {
            const norm = idx === 0 ? n1 : n2;
            html +=
                '<div class="analysis-infer-card"><h5>' +
                App().escapeHtml(g.label) +
                ' (n=' +
                g.n +
                ')</h5><p class="analysis-infer-stat-line">Media: ' +
                g.mean +
                ' · DE: ' +
                g.sd +
                ' · Mediana: ' +
                g.median +
                '</p><p class="analysis-infer-stat-line"><strong>Normalidad (' +
                App().escapeHtml(norm.test || '—') +
                '):</strong> p=' +
                formatP(norm.p_value) +
                '</p></div>';
        });
        html += '</div>';
        html +=
            '<div class="analysis-infer-card"><h5>Homogeneidad de varianzas</h5><p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(lev.test || 'Levene') +
            ':</strong> p=' +
            formatP(lev.p_value) +
            '</p></div>';
        html +=
            '<div class="analysis-infer-decision"><p><strong>Sugerencia:</strong> ' +
            App().escapeHtml(rec.label || '') +
            ' — ' +
            App().escapeHtml(rec.reason || '') +
            '</p></div>';
        mount.innerHTML = html;
        const method = rec.method;
        if (method) {
            const radio = document.querySelector('input[name="chisqContMethod"][value="' + method + '"]');
            if (radio) radio.checked = true;
        }
        updateContNext();
    }

    function renderContResults(data) {
        const mount = document.getElementById('chisqContTestMount');
        if (!mount) return;
        const chartId = plotId('chisqContBox');
        let html =
            '<div class="analysis-infer-summary-vars"><strong>Variable:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Grupos:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            ' · <strong>Prueba:</strong> ' +
            App().escapeHtml(data.method_label) +
            ' (p=' +
            formatP(data.p_value) +
            ')</' + 'div>';
        html += renderRTestTable(data.test_table_r, data.conclusion);
        const rows = (data.comparison_table && data.comparison_table.rows) || [];
        if (rows.length) {
            html +=
                '<p class="analysis-infer-table-title">Resumen por grupo</p><div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>Grupo</th><th>n</th><th>Media</th><th>DE</th><th>Mediana</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                html +=
                    '<tr><td>' +
                    App().escapeHtml(r.group) +
                    '</td><td>' +
                    r.n +
                    '</td><td>' +
                    App().escapeHtml(String(r.mean)) +
                    '</td><td>' +
                    App().escapeHtml(String(r.sd)) +
                    '</td><td>' +
                    App().escapeHtml(String(r.median)) +
                    '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        html += '<div id="' + chartId + '" class="analysis-chart analysis-chart-infer-box"></div>';
        html += renderEffectSize(data.effect_size);
        mount.innerHTML = html;
                plotContBoxplot(chartId, data.chart);
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            chisqSchema = null;
            return;
        }
        try {
            chisqSchema = await apiGet(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/chisq/schema'
            );
            const assoc = chisqSchema.association || {};
            const cont = chisqSchema.continuous || {};
            fillSelect(document.getElementById('chisqAssocPredictor'), assoc.predictors || [], 'id', 'label');
            fillSelect(document.getElementById('chisqAssocOutcome'), assoc.outcomes || [], 'id', 'label');
            fillSelect(document.getElementById('chisqContPredictor'), cont.predictors || [], 'id', 'label');
            fillSelect(document.getElementById('chisqContOutcome'), cont.outcomes || [], 'id', 'label');
            syncContGroupPairUI();
            renderAssocProfile(assoc);
        } catch (err) {
            chisqSchema = null;
            console.warn('Esquema chi-cuadrado:', err.message);
        }
    }

    async function verifyAssocAssumptions() {
        const pid = document.getElementById('chisqAssocPredictor')?.value;
        const oid = document.getElementById('chisqAssocOutcome')?.value;
        const id = getDatasetId();
        if (!pid || !oid || !id) {
            App().showToast('Seleccione predictor y variable respuesta', 'info');
            return;
        }
        App().showLoading('Verificando supuestos de la tabla...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/chisq/association/assumptions',
                { predictor_id: pid, outcome_id: oid }
            );
            renderAssocAssumptions(data);
            showAssocStep('chisqAssocStepAssumptions');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function runAssocTest() {
        const pid = document.getElementById('chisqAssocPredictor')?.value;
        const oid = document.getElementById('chisqAssocOutcome')?.value;
        const methodEl = document.querySelector('input[name="chisqAssocMethod"]:checked');
        const id = getDatasetId();
        if (!pid || !oid || !methodEl || !id) {
            App().showToast('Complete la selección y la declaración', 'info');
            return;
        }
        App().showLoading('Ejecutando prueba de asociación...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/chisq/association/run-test',
                { predictor_id: pid, outcome_id: oid, method: methodEl.value }
            );
            renderAssocResults(data);
            showAssocStep('chisqAssocStepTest');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function verifyContAssumptions() {
        const pid = document.getElementById('chisqContPredictor')?.value;
        const oid = document.getElementById('chisqContOutcome')?.value;
        const id = getDatasetId();
        if (!pid || !oid || !id) {
            App().showToast('Seleccione variable continua y grupos de respuesta', 'info');
            return;
        }
        const body = buildContRequestBody(pid, oid);
        if (!body) {
            const out = getContOutcomeSpec(oid);
            if (out && out.needs_group_pair) {
                App().showToast('Seleccione dos categorías distintas de Condicion', 'info');
            } else {
                App().showToast('Complete la selección de grupos', 'info');
            }
            return;
        }
        App().showLoading('Verificando supuestos...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/chisq/continuous/assumptions',
                body
            );
            renderContAssumptions(data);
            showContStep('chisqContStepAssumptions');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function runContTest() {
        const pid = document.getElementById('chisqContPredictor')?.value;
        const oid = document.getElementById('chisqContOutcome')?.value;
        const methodEl = document.querySelector('input[name="chisqContMethod"]:checked');
        const id = getDatasetId();
        if (!pid || !oid || !methodEl || !id) {
            App().showToast('Complete la selección y la declaración', 'info');
            return;
        }
        const body = buildContRequestBody(pid, oid, { method: methodEl.value });
        if (!body) {
            App().showToast('Seleccione dos categorías distintas de Condicion', 'info');
            return;
        }
        App().showLoading('Ejecutando prueba...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/chisq/continuous/run-test',
                body
            );
            renderContResults(data);
            showContStep('chisqContStepTest');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.querySelectorAll('.analysis-infer-section-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateChisqSection(tab.getAttribute('data-chisq-section'));
            });
        });
        document.getElementById('chisqAssocVerifyAssumptions')?.addEventListener('click', verifyAssocAssumptions);
        document.getElementById('chisqAssocNextToTest')?.addEventListener('click', runAssocTest);
        document.getElementById('chisqAssocBackFromAssumptions')?.addEventListener('click', function () {
            showAssocStep('chisqAssocStepSetup');
        });
        document.getElementById('chisqAssocBackToSetup')?.addEventListener('click', resetAssocWizard);
        document.getElementById('chisqAssocAssumptionsConfirm')?.addEventListener('change', updateAssocNext);
        document.querySelectorAll('input[name="chisqAssocMethod"]').forEach(function (r) {
            r.addEventListener('change', updateAssocNext);
        });

        document.getElementById('chisqContOutcome')?.addEventListener('change', syncContGroupPairUI);
        document.getElementById('chisqContVerifyAssumptions')?.addEventListener('click', verifyContAssumptions);
        document.getElementById('chisqContNextToTest')?.addEventListener('click', runContTest);
        document.getElementById('chisqContBackFromAssumptions')?.addEventListener('click', function () {
            showContStep('chisqContStepSetup');
        });
        document.getElementById('chisqContBackToSetup')?.addEventListener('click', resetContWizard);
        document.getElementById('chisqContAssumptionsConfirm')?.addEventListener('change', updateContNext);
        document.querySelectorAll('input[name="chisqContMethod"]').forEach(function (r) {
            r.addEventListener('change', updateContNext);
        });
    }

    function init() {
        bindControls();
        activateChisqSection('association');
        resetAssocWizard();
        resetContWizard();
        if (getDatasetId()) loadSchema();
    }

    function onDatasetChanged() {
        resetAssocWizard();
        resetContWizard();
        loadSchema();
    }

    function onSubmoduleShown() {
        if (getDatasetId() && !chisqSchema) loadSchema();
    }

    window.AnalysisInferencialChisq = {
        init: init,
        onDatasetChanged: onDatasetChanged,
        onSubmoduleShown: onSubmoduleShown
    };
})();
