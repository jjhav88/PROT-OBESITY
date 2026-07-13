/**
 * Regresión lineal — antecedentes maternos y perfil lipídico (programación fetal).
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    let regSchema = null;
    let regAssumptions = null;
    let plotCounter = 0;

    const REG_STEPS = [
        'regStepSetup',
        'regStepAssumpSimple',
        'regStepAssumpMultiple',
        'regStepResults'
    ];

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
                    return (
                        '<option value="' +
                        App().escapeHtml(String(v)) +
                        '">' +
                        App().escapeHtml(String(lbl)) +
                        '</option>'
                    );
                })
                .join('');
    }

    function formatP(p) {
        if (p == null || p === '') return '—';
        if (typeof p === 'number' && p < 0.001) return '<0.001';
        return String(p);
    }

    function showStep(step) {
        REG_STEPS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== step;
        });
    }

    function resetWizard() {
        regAssumptions = null;
        showStep('regStepSetup');
        const c1 = document.getElementById('regConfirmSimple');
        const c2 = document.getElementById('regConfirmMultiple');
        const n1 = document.getElementById('regNextToAssumpMulti');
        const run = document.getElementById('regRunAnalysis');
        if (c1) c1.checked = false;
        if (c2) c2.checked = false;
        if (n1) n1.disabled = true;
        if (run) run.disabled = true;
        ['regAssumpSimpleMount', 'regAssumpMultipleMount', 'regResultsMount'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    }

    function renderTestTable(testTable) {
        if (!testTable || !testTable.rows || !testTable.rows.length) return '';
        let h =
            '<p class="analysis-infer-table-title">Salida de la prueba</p>' +
            '<div class="analysis-table-wrap"><table class="analysis-data-table analysis-infer-r-test">' +
            '<thead><tr><th></th><th>Valor</th></tr></thead><tbody>';
        testTable.rows.forEach(function (row) {
            h +=
                '<tr><th>' +
                App().escapeHtml(row.term) +
                '</th><td>' +
                App().escapeHtml(row.value == null ? '—' : String(row.value)) +
                '</td></tr>';
        });
        h += '</tbody></table></div>';
        if (testTable.note) {
            h += '<p class="analysis-infer-stat-line">' + App().escapeHtml(testTable.note) + '</p>';
        }
        return h;
    }

    function renderCoefTable(coefs, note) {
        if (!coefs || !coefs.length) {
            return '<p class="analysis-infer-stat-line">Modelo no estimable.</p>';
        }
        let h =
            '<div class="analysis-table-wrap"><table class="analysis-data-table">' +
            '<thead><tr><th>Término</th><th>β</th><th>IC 95%</th><th>p-value</th></tr></thead><tbody>';
        coefs.forEach(function (r) {
            h +=
                '<tr><td>' +
                App().escapeHtml(r.term) +
                '</td><td>' +
                App().escapeHtml(r.coef == null ? '—' : String(r.coef)) +
                '</td><td>' +
                App().escapeHtml(r.ci_display || '—') +
                '</td><td>' +
                App().escapeHtml(r.p_display || '—') +
                '</td></tr>';
        });
        h += '</tbody></table></div>';
        if (note) {
            h += '<p class="analysis-infer-stat-line">' + App().escapeHtml(note) + '</p>';
        }
        return h;
    }

    function renderAssumptionCard(title, items) {
        let h = '<div class="analysis-infer-card"><h5>' + App().escapeHtml(title) + '</h5>';
        items.forEach(function (it) {
            const okCls = it.ok ? 'analysis-infer-ok' : 'analysis-infer-fail';
            h +=
                '<p class="analysis-infer-stat-line ' +
                okCls +
                '"><strong>' +
                App().escapeHtml(it.label) +
                ':</strong> ' +
                App().escapeHtml(it.text) +
                '</p>';
        });
        return h + '</div>';
    }

    function renderRecommendation(rec, blocked) {
        const cls = rec.can_apply
            ? 'analysis-infer-conclusion analysis-infer-conclusion--ns'
            : 'analysis-infer-conclusion analysis-infer-conclusion--sig';
        let h =
            '<div class="' +
            cls +
            '" style="margin-top:16px"><p><strong>Recomendación:</strong> ' +
            App().escapeHtml(rec.label || '') +
            ' — ' +
            App().escapeHtml(rec.reason || '') +
            '</p>';
        if (!rec.can_apply && (rec.alternatives || []).length) {
            h += '<p><strong>Pruebas alternativas sugeridas:</strong></p><ul>';
            rec.alternatives.forEach(function (alt) {
                h += '<li>' + App().escapeHtml(alt) + '</li>';
            });
            h += '</ul>';
        }
        if (blocked) {
            h +=
                '<p class="analysis-infer-stat-line"><em>No se aplicará regresión OLS hasta que los supuestos sean aceptables.</em></p>';
        }
        return h + '</div>';
    }

    function renderSimpleAssumptions(data) {
        const mount = document.getElementById('regAssumpSimpleMount');
        if (!mount || !data) return;
        const s = data.simple || {};
        const norm = s.normality || {};
        const lin = s.linearity || {};
        const dw = s.independence || {};
        const rec = s.recommendation || {};

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Antecedente:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Respuesta:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            ' · <strong>n =</strong> ' +
            data.n +
            '</div>';
        html += '<div class="analysis-infer-assumption-grid">';
        html += renderAssumptionCard('Normalidad de residuos', [
            {
                label: norm.test || 'Prueba',
                text:
                    'p=' +
                    formatP(norm.p_value) +
                    ' — ' +
                    (norm.interpretation || ''),
                ok: norm.ok
            }
        ]);
        html += renderAssumptionCard('Linealidad', [
            {
                label: lin.test || 'Prueba',
                text:
                    (lin.p_value != null ? 'p=' + formatP(lin.p_value) + ' — ' : '') +
                    (lin.interpretation || ''),
                ok: lin.ok
            }
        ]);
        html += renderAssumptionCard('Independencia (Durbin-Watson)', [
            {
                label: 'DW',
                text:
                    (dw.statistic != null ? String(dw.statistic) : '—') +
                    ' (ref. ' +
                    (dw.reference_range || '1,5–2,5') +
                    ') — ' +
                    (dw.interpretation || ''),
                ok: dw.ok
            }
        ]);
        html += '</div>';
        html += renderRecommendation(rec, !rec.can_apply);
        mount.innerHTML = html;
        updateSimpleNext();
    }

    function renderMultipleAssumptions(data) {
        const mount = document.getElementById('regAssumpMultipleMount');
        if (!mount || !data) return;
        const m = data.multiple || {};
        const norm = m.normality || {};
        const dw = m.independence || {};
        const mc = m.multicollinearity || {};
        const rec = m.recommendation || {};

        let html =
            '<div class="analysis-infer-summary-vars">Modelo ajustado por <strong>edad</strong> y <strong>sexo</strong> del niño, además del antecedente materno.</div>';
        html += '<div class="analysis-infer-assumption-grid">';
        html += renderAssumptionCard('Normalidad de residuos', [
            {
                label: norm.test || 'Prueba',
                text: 'p=' + formatP(norm.p_value) + ' — ' + (norm.interpretation || ''),
                ok: norm.ok
            }
        ]);
        html += renderAssumptionCard('Independencia (Durbin-Watson)', [
            {
                label: 'DW',
                text:
                    (dw.statistic != null ? String(dw.statistic) : '—') +
                    ' — ' +
                    (dw.interpretation || ''),
                ok: dw.ok
            }
        ]);
        html += '</div>';

        html += '<p class="analysis-infer-table-title">Multicolinealidad (VIF)</p>';
        html +=
            '<p class="analysis-infer-stat-line">Umbral aceptable: VIF &lt; ' +
            (mc.vif_threshold_ok || 5) +
            '; alerta si VIF &gt; ' +
            (mc.vif_threshold_warn || 10) +
            '.</p>';
        const vrows = mc.rows || [];
        if (vrows.length) {
            html +=
                '<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>Predictor</th><th>VIF</th><th>Estado</th></tr></thead><tbody>';
            vrows.forEach(function (r) {
                const st =
                    r.flag === 'ok'
                        ? 'Aceptable'
                        : r.flag === 'warning'
                          ? 'Moderada'
                          : 'Problemática';
                html +=
                    '<tr><td>' +
                    App().escapeHtml(r.predictor) +
                    '</td><td>' +
                    App().escapeHtml(String(r.vif)) +
                    '</td><td>' +
                    App().escapeHtml(st) +
                    '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        html +=
            '<p class="analysis-infer-stat-line">' + App().escapeHtml(mc.interpretation || '') + '</p>';
        html += renderRecommendation(rec, !data.can_run_regression);
        mount.innerHTML = html;
        updateMultiRun();
    }

    function updateSimpleNext() {
        const cb = document.getElementById('regConfirmSimple');
        const btn = document.getElementById('regNextToAssumpMulti');
        if (!btn) return;
        btn.disabled = !(cb && cb.checked);
    }

    function updateMultiRun() {
        const cb = document.getElementById('regConfirmMultiple');
        const btn = document.getElementById('regRunAnalysis');
        if (!btn) return;
        const canRun = regAssumptions && regAssumptions.can_run_regression;
        btn.disabled = !(cb && cb.checked) || !canRun;
        if (!canRun && regAssumptions) {
            btn.title = 'No se cumplen los supuestos; revise las alternativas sugeridas';
        } else {
            btn.title = '';
        }
    }

    function renderModelBlock(block) {
        if (!block) return '';
        let h =
            '<section class="analysis-infer-reg-model">' +
            '<h4 class="analysis-infer-table-title">' +
            App().escapeHtml(block.title || 'Modelo') +
            '</h4>';
        h += renderCoefTable(block.coefficients, block.bootstrap_note);
        h += renderTestTable(block.test_table);
        return h + '</section>';
    }

    function plotScatterRegression(containerId, chart) {
        if (!window.Plotly || !chart) return;
        const el = document.getElementById(containerId);
        if (!el) return;
        const pts = chart.points || [];
        const traces = [
            {
                type: 'scatter',
                mode: 'markers',
                name: 'Observaciones',
                x: pts.map(function (p) {
                    return p.x;
                }),
                y: pts.map(function (p) {
                    return p.y;
                }),
                marker: { color: '#2563eb', size: 8, opacity: 0.75 }
            }
        ];
        const line = chart.line || [];
        if (line.length >= 2) {
            traces.push({
                type: 'scatter',
                mode: 'lines',
                name: 'Ajuste (simple)',
                x: line.map(function (p) {
                    return p.x;
                }),
                y: line.map(function (p) {
                    return p.y;
                }),
                line: { color: '#dc2626', width: 2 }
            });
        }
        window.Plotly.newPlot(
            el,
            traces,
            {
                margin: { t: 36, r: 24, b: 48, l: 56 },
                xaxis: { title: chart.x_label || 'Predictor', tickvals: [0, 1], ticktext: ['No', 'Sí'] },
                yaxis: { title: chart.y_label || 'Respuesta' },
                legend: { orientation: 'h', y: 1.12 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: '#fafafa'
            },
            plotlyConfig()
        );
        el.classList.add('analysis-chart');
    }

    function renderResults(data) {
        const mount = document.getElementById('regResultsMount');
        if (!mount) return;
        const chartId = plotId('regScatter');
        const interp = data.interpretation || {};
        const fetalCls = interp.highlight_fetal
            ? 'analysis-infer-fetal-insight analysis-infer-fetal-insight--highlight'
            : 'analysis-infer-fetal-insight';

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Antecedente materno:</strong> ' +
            App().escapeHtml(data.predictor_label) +
            ' · <strong>Respuesta:</strong> ' +
            App().escapeHtml(data.outcome_label) +
            ' · <strong>n =</strong> ' +
            (data.n != null ? data.n : '—') +
            '</div>';
        if (data.method_note) {
            html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(data.method_note) + '</p>';
        }
        if (data.model_design) {
            const md = data.model_design;
            html +=
                '<div class="analysis-infer-card"><h5>Diseño del modelo</h5>' +
                '<p class="analysis-infer-stat-line"><strong>Respuesta (Y):</strong> ' +
                App().escapeHtml(md.response || '') +
                '</p><p class="analysis-infer-stat-line"><strong>Predictor (X):</strong> ' +
                App().escapeHtml(md.predictor || '') +
                ' (dicotómico 0/1)</p><p class="analysis-infer-stat-line"><strong>Simple:</strong> ' +
                App().escapeHtml(md.simple_formula || '') +
                '</p><p class="analysis-infer-stat-line"><strong>Múltiple:</strong> ' +
                App().escapeHtml(md.multiple_formula || '') +
                '</p></div>';
        }
        html += '<p class="' + fetalCls + '">' + App().escapeHtml(interp.text || '') + '</p>';
        html += renderModelBlock(data.simple);
        html += renderModelBlock(data.multiple);
        html +=
            '<p class="analysis-infer-table-title">Gráfico — regresión simple</p>' +
            '<div id="' +
            chartId +
            '" class="analysis-chart analysis-chart-infer-box"></div>';
        mount.innerHTML = html;
        plotScatterRegression(chartId, data.chart);
        showStep('regStepResults');
    }

    function renderProfile(schema) {
        const el = document.getElementById('regFetalInsight');
        if (!el) return;
        el.innerHTML =
            '<p class="analysis-infer-fetal-insight">' + App().escapeHtml(schema.insight || '') + '</p>';
        const noteEl = document.getElementById('regModelDesignNote');
        if (noteEl && schema.model_design_note) {
            noteEl.innerHTML =
                '<p class="analysis-infer-stat-line">' +
                App().escapeHtml(schema.model_design_note) +
                '</p>';
        }
    }

    function fillOutcomeByProfile() {
        const profileSel = document.getElementById('regOutcomeProfile');
        const outcomeSel = document.getElementById('regOutcome');
        if (!outcomeSel || !regSchema) return;
        const profileId = profileSel?.value || 'lipid_metabolic';
        const profiles = regSchema.outcome_profiles || {};
        const block = profiles[profileId];
        const outcomes = block?.outcomes || (regSchema.outcomes || []).filter(function (o) {
            return o.profile_id === profileId;
        });
        fillSelect(outcomeSel, outcomes, 'id', 'label');
        const first = outcomes.find(function (o) {
            return o.available !== false;
        });
        if (first) outcomeSel.value = first.id;
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            regSchema = null;
            return;
        }
        try {
            regSchema = await apiGet(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/regression/schema'
            );
            fillSelect(document.getElementById('regPredictor'), regSchema.predictors || [], 'id', 'label');
            fillOutcomeByProfile();
            renderProfile(regSchema);
        } catch (err) {
            regSchema = null;
            console.warn('Esquema regresión:', err.message);
        }
    }

    async function verifyAssumptions() {
        const pid = document.getElementById('regPredictor')?.value;
        const oid = document.getElementById('regOutcome')?.value;
        const id = getDatasetId();
        if (!pid || !oid || !id) {
            App().showToast('Seleccione antecedente materno y variable de respuesta', 'info');
            return;
        }
        App().showLoading('Verificando supuestos...');
        try {
            regAssumptions = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/regression/assumptions',
                { predictor_id: pid, outcome_id: oid }
            );
            renderSimpleAssumptions(regAssumptions);
            showStep('regStepAssumpSimple');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function goToMultipleAssumptions() {
        if (!regAssumptions) return;
        renderMultipleAssumptions(regAssumptions);
        const c2 = document.getElementById('regConfirmMultiple');
        if (c2) c2.checked = false;
        showStep('regStepAssumpMultiple');
        updateMultiRun();
    }

    async function runRegression() {
        const pid = document.getElementById('regPredictor')?.value;
        const oid = document.getElementById('regOutcome')?.value;
        const id = getDatasetId();
        if (!pid || !oid || !id) {
            App().showToast('Seleccione variables', 'info');
            return;
        }
        if (!regAssumptions || !regAssumptions.can_run_regression) {
            App().showToast(
                'No se puede ejecutar la regresión: revise los supuestos y las alternativas sugeridas',
                'info'
            );
            return;
        }
        App().showLoading('Calculando regresión lineal...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/regression/run',
                { predictor_id: pid, outcome_id: oid }
            );
            renderResults(data);
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('regOutcomeProfile')?.addEventListener('change', fillOutcomeByProfile);
        document.getElementById('regVerifyAssumptions')?.addEventListener('click', verifyAssumptions);
        document.getElementById('regBackFromAssumpSimple')?.addEventListener('click', function () {
            showStep('regStepSetup');
        });
        document.getElementById('regNextToAssumpMulti')?.addEventListener('click', goToMultipleAssumptions);
        document.getElementById('regBackFromAssumpMulti')?.addEventListener('click', function () {
            showStep('regStepAssumpSimple');
        });
        document.getElementById('regConfirmSimple')?.addEventListener('change', updateSimpleNext);
        document.getElementById('regConfirmMultiple')?.addEventListener('change', updateMultiRun);
        document.getElementById('regRunAnalysis')?.addEventListener('click', runRegression);
        document.getElementById('regBackToSetup')?.addEventListener('click', resetWizard);
    }

    function init() {
        bindControls();
        resetWizard();
        if (getDatasetId()) loadSchema();
    }

    function onSubmoduleShown() {
        if (getDatasetId()) loadSchema();
        else resetWizard();
    }

    function onDatasetChanged() {
        regSchema = null;
        resetWizard();
        if (getDatasetId()) loadSchema();
    }

    window.AnalysisInferencialRegression = {
        init: init,
        onSubmoduleShown: onSubmoduleShown,
        onDatasetChanged: onDatasetChanged,
        loadSchema: loadSchema,
        resetWizard: resetWizard
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
