/**
 * ANCOVA — comparación de grupos ajustada por covariables.
 */
(function () {
    'use strict';

    const App = () => window.AnalysisApp;
    const API = () => App().API;

    const ANC_STEPS = ['ancStepSetup', 'ancStepAssumptions', 'ancStepResults'];

    let ancSchema = null;
    let ancAssumptions = null;
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

    function showStep(step) {
        ANC_STEPS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== step;
        });
    }

    function resetWizard() {
        ancAssumptions = null;
        showStep('ancStepSetup');
        const confirm = document.getElementById('ancAssumptionsConfirm');
        const runBtn = document.getElementById('ancRunAnalysis');
        if (confirm) confirm.checked = false;
        if (runBtn) runBtn.disabled = true;
        ['ancAssumptionsMount', 'ancResultsMount'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    }

    function renderCovariates(covariates) {
        const mount = document.getElementById('ancCovariatesMount');
        if (!mount) return;
        mount.innerHTML = (covariates || [])
            .map(function (c) {
                const checked = c.default && c.available ? ' checked' : '';
                const disabled = !c.available ? ' disabled' : '';
                const cls = c.available ? '' : ' analysis-infer-cov-item--unavailable';
                return (
                    '<label class="analysis-infer-cov-item' +
                    cls +
                    '">' +
                    '<input type="checkbox" name="ancCov" value="' +
                    App().escapeHtml(c.id) +
                    '"' +
                    checked +
                    disabled +
                    ' />' +
                    '<span class="analysis-infer-cov-label">' +
                    App().escapeHtml(c.label) +
                    '</span>' +
                    '<span class="analysis-infer-cov-rationale">' +
                    App().escapeHtml(c.rationale || '') +
                    (c.available ? '' : ' (no disponible en la base)') +
                    '</span></label>'
                );
            })
            .join('');
    }

    function getSelectedCovariates() {
        return Array.prototype.slice
            .call(document.querySelectorAll('input[name="ancCov"]:checked'))
            .map(function (el) {
                return el.value;
            });
    }

    async function loadSchema() {
        const id = getDatasetId();
        if (!id) {
            ancSchema = null;
            return;
        }
        try {
            ancSchema = await apiGet(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/ancova/schema'
            );
            fillSelect(
                document.getElementById('ancFactor'),
                ancSchema.categorical_variables || [],
                'column',
                'label'
            );
            fillSelect(
                document.getElementById('ancDependent'),
                ancSchema.numeric_variables || [],
                'id',
                'label'
            );
            renderSuggestedProfile('ancLipidProfile', ancSchema.lipid_profile, ancSchema.numeric_variables);
            renderSuggestedProfile(
                'ancAnthroProfile',
                ancSchema.anthropometric_profile,
                ancSchema.numeric_variables
            );
            renderCovariates(ancSchema.covariates || []);
        } catch (err) {
            ancSchema = null;
            console.warn('Esquema ANCOVA:', err.message);
        }
    }

    function plotlyConfig(overrides) {
        return window.AnalysisPlotly
            ? window.AnalysisPlotly.config(overrides)
            : { responsive: true, displayModeBar: 'hover' };
    }

    function plotHistogram(containerId, values, title) {
        if (!window.Plotly || !values || !values.length) return;
        Plotly.newPlot(
            containerId,
            [{ type: 'histogram', x: values, marker: { color: '#2563eb', opacity: 0.75 } }],
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
                marker: { color: '#2563eb', size: 7 }
            }
        ];
        const ref = qq.reference_line;
        if (ref && ref.x && ref.y && ref.x.length >= 2) {
            traces.push({
                type: 'scatter',
                mode: 'lines',
                x: ref.x,
                y: ref.y,
                line: { color: '#dc2626', width: 2, dash: 'dash' },
                hoverinfo: 'skip'
            });
        }
        Plotly.newPlot(
            containerId,
            traces,
            {
                title: 'Gráfico Q-Q (residuos)',
                margin: { t: 40, b: 44, l: 48, r: 16 },
                height: 280,
                showlegend: false
            },
            window.AnalysisPlotly ? window.AnalysisPlotly.config() : { responsive: true, displayModeBar: 'hover' }
        );
    }

    function updateRunButton() {
        const confirm = document.getElementById('ancAssumptionsConfirm');
        const runBtn = document.getElementById('ancRunAnalysis');
        const canApply = ancAssumptions && ancAssumptions.recommendation && ancAssumptions.recommendation.can_apply;
        if (runBtn) {
            runBtn.disabled = !(confirm && confirm.checked && canApply);
        }
    }

    function renderAssumptions(data) {
        const mount = document.getElementById('ancAssumptionsMount');
        if (!mount) return;
        ancAssumptions = data;
        const n = data.normality || {};
        const l = data.homogeneity || {};
        const slopes = data.homogeneity_slopes || {};
        const rec = data.recommendation || {};
        const histId = plotId('ancHist');
        const qqId = plotId('ancQQ');

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Factor:</strong> ' +
            App().escapeHtml(data.factor_column) +
            ' · <strong>Dependiente:</strong> ' +
            App().escapeHtml(data.dependent_label) +
            ' · <strong>Covariables:</strong> ' +
            App().escapeHtml((data.covariate_labels || []).join(', ')) +
            ' · <strong>n=</strong>' +
            (data.n || '—') +
            '</div>';

        html += '<div class="analysis-infer-assumption-grid">';
        html += '<div class="analysis-infer-card"><h5>Normalidad (residuos ANCOVA)</h5>';
        html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(n.note || '') + '</p>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(n.test || '') +
            ':</strong> p=' +
            formatP(n.p_value) +
            ' → ' +
            (n.normal ? 'compatible con normalidad' : 'no normal') +
            '</p>';
        html += '<div id="' + histId + '" class="analysis-infer-chart"></div>';
        html += '<div id="' + qqId + '" class="analysis-infer-chart"></div></div>';

        html += '<div class="analysis-infer-card"><h5>Homogeneidad de varianzas (residuos)</h5>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(l.test || 'Levene') +
            ':</strong> p=' +
            formatP(l.p_value) +
            ' → ' +
            (l.homogeneous ? 'varianzas homogéneas' : 'heterocedasticidad') +
            '</p></div>';

        html += '<div class="analysis-infer-card"><h5>Homogeneidad de pendientes</h5>';
        html +=
            '<p class="analysis-infer-stat-line"><strong>' +
            App().escapeHtml(slopes.test || '') +
            ':</strong> ' +
            (slopes.statistic != null ? 'F=' + slopes.statistic + ', ' : '') +
            'p=' +
            formatP(slopes.p_value) +
            '</p>';
        html +=
            '<p class="analysis-infer-stat-line ' +
            (slopes.ok ? 'analysis-infer-ok' : 'analysis-infer-fail') +
            '">' +
            App().escapeHtml(slopes.interpretation || '') +
            '</p></div></div>';

        const recCls = rec.can_apply
            ? 'analysis-infer-conclusion analysis-infer-conclusion--ns'
            : 'analysis-infer-conclusion analysis-infer-conclusion--sig';
        html +=
            '<div class="' +
            recCls +
            '" style="margin-top:16px"><p><strong>Recomendación:</strong> ' +
            App().escapeHtml(rec.label || '') +
            ' — ' +
            App().escapeHtml(rec.reason || '') +
            '</p>';
        if (!rec.can_apply && (rec.alternatives || []).length) {
            html += '<p><strong>Alternativas sugeridas:</strong></p><ul>';
            rec.alternatives.forEach(function (alt) {
                html += '<li>' + App().escapeHtml(alt) + '</li>';
            });
            html += '</ul>';
        }
        html += '</div>';

        mount.innerHTML = html;

        plotHistogram(histId, n.histogram_values || [], 'Histograma de residuos');
        plotQQ(qqId, n.qqplot || {});
        updateRunButton();
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
                {
                    type: 'line',
                    xref: 'x',
                    yref: 'y',
                    x0: p.g1,
                    x1: p.g2,
                    y0: yLine,
                    y1: yLine,
                    line: { color: '#0f172a', width: 1.2 }
                },
                {
                    type: 'line',
                    xref: 'x',
                    yref: 'y',
                    x0: p.g1,
                    x1: p.g1,
                    y0: yLine - span * 0.015,
                    y1: yLine,
                    line: { color: '#0f172a', width: 1.2 }
                },
                {
                    type: 'line',
                    xref: 'x',
                    yref: 'y',
                    x0: p.g2,
                    x1: p.g2,
                    y0: yLine - span * 0.015,
                    y1: yLine,
                    line: { color: '#0f172a', width: 1.2 }
                }
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
                title: data.dependent_label + ' por grupo (crudo)',
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

    function renderEffectSize(es) {
        if (!es) return '';
        const ranges = es.interpretation_ranges || [];
        let html =
            '<section class="analysis-infer-effect"><h4 class="analysis-infer-table-title">Tamaño del efecto</h4>';
        if (es.note) {
            html += '<p class="analysis-infer-stat-line">' + App().escapeHtml(es.note) + '</p>';
        }
        html +=
            '<div class="analysis-table-wrap"><table class="analysis-data-table">' +
            '<thead><tr><th>Medida</th><th>Valor</th><th>Interpretación</th></tr></thead><tbody><tr>' +
            '<td>' +
            App().escapeHtml((es.table && es.table.measure) || es.name || '—') +
            '</td><td>' +
            App().escapeHtml((es.table && es.table.value) || es.value_display || '—') +
            '</td><td>' +
            App().escapeHtml((es.table && es.table.interpretation) || es.interpretation || '—') +
            '</td></tr></tbody></table></div>';
        html += '<aside class="analysis-infer-effect-ranges"><h5>Rangos</h5><ul>';
        ranges.forEach(function (r) {
            html +=
                '<li><strong>' +
                App().escapeHtml(r.label) +
                ':</strong> ' +
                App().escapeHtml(r.range) +
                '</li>';
        });
        html += '</ul></aside></section>';
        return html;
    }

    function renderResults(data) {
        const mount = document.getElementById('ancResultsMount');
        if (!mount) return;
        const gt = data.global_table || {};
        const ph = data.posthoc || {};
        const boxId = plotId('ancBox');

        let html =
            '<div class="analysis-infer-summary-vars"><strong>Factor:</strong> ' +
            App().escapeHtml(data.factor_column) +
            ' · <strong>Dependiente:</strong> ' +
            App().escapeHtml(data.dependent_label) +
            ' · <strong>Ajuste:</strong> ' +
            App().escapeHtml((data.covariate_labels || []).join(', ')) +
            ' · <strong>Prueba:</strong> ' +
            App().escapeHtml(data.method_label) +
            ' (p global=' +
            formatP(gt.p_value) +
            ')</div>';

        html += renderTable('Prueba F del factor (ajustada)', gt.rows || [], [
            { key: 'source', label: '' },
            { key: 'df', label: 'Df' },
            { key: 'mean_sq', label: 'Mean Sq' },
            { key: 'F', label: 'F' },
            { key: 'p', label: 'Pr(>F)' }
        ]);

        html += renderTable('Medias ajustadas (EMM)', data.adjusted_means || [], [
            { key: 'label', label: 'Grupo' },
            { key: 'adjusted_mean', label: 'Media ajustada' }
        ]);

        html +=
            '<p class="analysis-infer-stat-line"><strong>Post-hoc:</strong> ' +
            App().escapeHtml(ph.test || '') +
            ' · <strong>Corrección:</strong> ' +
            App().escapeHtml(ph.correction || '—') +
            '</p>';

        html += renderTable('Comparaciones pareadas (medias ajustadas)', ph.rows || [], [
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

    async function verifyAssumptions() {
        const factor = document.getElementById('ancFactor')?.value;
        const dependent = document.getElementById('ancDependent')?.value;
        const covs = getSelectedCovariates();
        if (!factor || !dependent) {
            App().showToast('Seleccione factor y variable dependiente', 'info');
            return;
        }
        if (!covs.length) {
            App().showToast('Seleccione al menos una covariable de ajuste', 'info');
            return;
        }
        const id = getDatasetId();
        if (!id) return;

        App().showLoading('Verificando supuestos ANCOVA...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/ancova/assumptions',
                { factor_column: factor, dependent_id: dependent, covariate_ids: covs }
            );
            renderAssumptions(data);
            showStep('ancStepAssumptions');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    async function runAnalysis() {
        const factor = document.getElementById('ancFactor')?.value;
        const dependent = document.getElementById('ancDependent')?.value;
        const covs = getSelectedCovariates();
        if (!factor || !dependent || !covs.length) return;
        const id = getDatasetId();
        if (!id) return;

        App().showLoading('Ejecutando ANCOVA...');
        try {
            const data = await apiPost(
                '/datasets/' + encodeURIComponent(id) + '/inferencial/ancova/run',
                { factor_column: factor, dependent_id: dependent, covariate_ids: covs }
            );
            renderResults(data);
            showStep('ancStepResults');
        } catch (err) {
            App().showToast(err.message, 'error');
        } finally {
            App().hideLoading();
        }
    }

    function bindControls() {
        document.getElementById('ancVerifyAssumptions')?.addEventListener('click', verifyAssumptions);
        document.getElementById('ancRunAnalysis')?.addEventListener('click', runAnalysis);
        document.getElementById('ancBackFromAssumptions')?.addEventListener('click', function () {
            showStep('ancStepSetup');
        });
        document.getElementById('ancBackToSetup')?.addEventListener('click', resetWizard);
        document.getElementById('ancAssumptionsConfirm')?.addEventListener('change', updateRunButton);
    }

    function init() {
        bindControls();
        resetWizard();
    }

    function onPanelShown() {
        if (getDatasetId()) loadSchema();
    }

    function onDatasetChanged() {
        resetWizard();
        loadSchema();
    }

    window.AnalysisInferencialAncova = {
        init: init,
        onPanelShown: onPanelShown,
        onDatasetChanged: onDatasetChanged
    };
})();
